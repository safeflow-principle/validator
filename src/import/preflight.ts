import type { AnnotationValue } from "../core/types";
import type { BenchmarkPromptIndex } from "../benchmarks/promptIndex";
import type { DatasetMapping, DatasetRow, ImportField, ImportIssue, ImportPreflight, ParsedDataset, PreflightRow } from "./types";

const aliases: Record<ImportField, string[]> = {
  prompt: ["prompt", "question", "input", "user_prompt", "request"],
  response: ["response", "answer", "output", "model_response", "assistant_response"],
  externalId: ["id", "item_id", "external_id"],
  benchmarkPromptId: ["prompt_id", "benchmark_prompt_id", "airbench_prompt_id"],
  categoryId: ["category_id", "categoryid", "cate_idx", "cate-idx", "intent", "airbench_cate_idx"],
  judgeScore: ["judge_score", "score", "automated_score"],
  judgeReasoning: ["judge_reasoning", "reasoning", "judge_rationale"],
  referenceLabel: ["reference_label", "gold_label", "label"],
};

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

export function suggestMapping(columns: readonly string[]): DatasetMapping {
  const byNormalized = new Map(columns.map((column) => [normalized(column), column]));
  return Object.fromEntries(Object.entries(aliases).flatMap(([field, candidates]) => {
    const match = candidates.map(normalized).map((candidate) => byNormalized.get(candidate)).find(Boolean);
    return match ? [[field, match]] : [];
  })) as DatasetMapping;
}

function scalar(value: unknown): AnnotationValue | undefined {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mappedValue(row: DatasetRow, mapping: DatasetMapping, field: ImportField): unknown {
  const column = mapping[field];
  return column ? row[column] : undefined;
}

export function preflightDataset(
  dataset: ParsedDataset,
  mapping: DatasetMapping,
  options: { knownCategoryIds: ReadonlySet<string>; promptIndex?: BenchmarkPromptIndex },
): ImportPreflight {
  const issues: ImportIssue[] = [...dataset.issues];
  if (!mapping.prompt && !mapping.benchmarkPromptId) {
    issues.push({ severity: "error", code: "missing-mapping", message: "Map a prompt column or an AIR-BENCH prompt ID column.", column: "prompt" });
  }
  if (!mapping.response) issues.push({ severity: "error", code: "missing-mapping", message: "Map a column to response.", column: "response" });
  for (const [field, column] of Object.entries(mapping)) {
    if (column && !dataset.columns.includes(column)) {
      issues.push({ severity: "error", code: "unknown-column", message: `Mapped column ${column} does not exist.`, column: field });
    }
  }

  const mappedColumns = new Set(Object.values(mapping).filter((column): column is string => Boolean(column)));
  const externalIds = new Set<string>();
  const rows: PreflightRow[] = [];
  dataset.rows.forEach((source, index) => {
    const rowNumber = index + 1;
    const uploadedPrompt = text(mappedValue(source, mapping, "prompt"));
    const uploadedCategoryId = text(mappedValue(source, mapping, "categoryId"));
    const benchmarkPromptId = text(mappedValue(source, mapping, "benchmarkPromptId")) || undefined;
    const canonical = benchmarkPromptId ? options.promptIndex?.get(benchmarkPromptId) : undefined;
    if (benchmarkPromptId && !canonical) {
      const sufficientExplicitData = Boolean(uploadedPrompt && uploadedCategoryId);
      issues.push({
        severity: sufficientExplicitData ? "warning" : "error",
        code: "unknown-benchmark-prompt-id",
        message: sufficientExplicitData
          ? `Prompt ID ${benchmarkPromptId} is not recognized; uploaded prompt and category values will be used.`
          : `Prompt ID ${benchmarkPromptId} is not recognized and requires explicit prompt and category values.`,
        row: rowNumber,
        column: mapping.benchmarkPromptId,
      });
    }
    if (canonical && uploadedPrompt && uploadedPrompt !== canonical.text.trim()) {
      issues.push({ severity: "error", code: "canonical-prompt-conflict", message: `Uploaded prompt conflicts with canonical AIR-BENCH prompt ${benchmarkPromptId}.`, row: rowNumber, column: mapping.prompt });
    }
    if (canonical && uploadedCategoryId && uploadedCategoryId !== canonical.categoryId) {
      issues.push({ severity: "error", code: "canonical-category-conflict", message: `Uploaded category ${uploadedCategoryId} conflicts with canonical category ${canonical.categoryId}.`, row: rowNumber, column: mapping.categoryId });
    }
    const prompt = uploadedPrompt || canonical?.text.trim() || "";
    const response = text(mappedValue(source, mapping, "response"));
    if (!prompt) issues.push({ severity: "error", code: "missing-prompt", message: "Prompt is empty.", row: rowNumber, column: mapping.prompt });
    if (!response) issues.push({ severity: "error", code: "missing-response", message: "Response is empty.", row: rowNumber, column: mapping.response });

    const externalId = text(mappedValue(source, mapping, "externalId")) || benchmarkPromptId || `row-${rowNumber}`;
    if (externalIds.has(externalId)) issues.push({ severity: "error", code: "duplicate-external-id", message: `Duplicate external ID: ${externalId}.`, row: rowNumber, column: mapping.externalId });
    externalIds.add(externalId);

    const categoryId = uploadedCategoryId || canonical?.categoryId || undefined;
    if (categoryId && !options.knownCategoryIds.has(categoryId)) {
      issues.push({ severity: "error", code: "unknown-category", message: `Category ${categoryId} is not in the selected benchmark pack.`, row: rowNumber, column: mapping.categoryId });
    }

    const judgeScore = scalar(mappedValue(source, mapping, "judgeScore"));
    const judgeReasoning = text(mappedValue(source, mapping, "judgeReasoning")) || undefined;
    const referenceLabel = scalar(mappedValue(source, mapping, "referenceLabel"));
    if (mapping.judgeScore && judgeScore === undefined) {
      issues.push({ severity: "error", code: "invalid-judge-score", message: "Judge score must be a string, number, boolean, or null.", row: rowNumber, column: mapping.judgeScore });
    }
    if (mapping.referenceLabel && referenceLabel === undefined) {
      issues.push({ severity: "error", code: "invalid-reference-label", message: "Reference label must be a scalar value.", row: rowNumber, column: mapping.referenceLabel });
    }

    const metadata = Object.fromEntries(Object.entries(source).filter(([column]) => !mappedColumns.has(column)));
    rows.push({
      sourceRow: rowNumber,
      externalId,
      ...(benchmarkPromptId ? { benchmarkPromptId } : {}),
      prompt,
      response,
      ...(categoryId ? { categoryId } : {}),
      metadata,
      fieldProvenance: {
        ...(benchmarkPromptId ? { benchmarkPromptId: "uploaded-source" as const } : {}),
        ...(prompt ? { prompt: uploadedPrompt ? "uploaded-source" as const : "air-bench-benchmark-asset" as const } : {}),
        ...(categoryId ? { categoryId: uploadedCategoryId ? "uploaded-source" as const : "air-bench-benchmark-asset" as const } : {}),
        ...(categoryId ? { taxonomy: "safeflow-derived-mapping" as const } : {}),
      },
      ...(judgeScore !== undefined || judgeReasoning ? { judge: { score: judgeScore ?? null, ...(judgeReasoning ? { reasoning: judgeReasoning } : {}) } } : {}),
      ...(referenceLabel !== undefined ? { referenceLabel } : {}),
    });
  });

  if (rows.some((row) => !row.categoryId)) issues.push({ severity: "warning", code: "uncategorized", message: "Some rows have no category; benchmark reference metadata will be unavailable for those items." });
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    ready: errors === 0,
    rows,
    issues,
    summary: {
      sourceRows: dataset.rows.length,
      validRows: errors === 0 ? rows.length : Math.max(0, rows.length - new Set(issues.filter((issue) => issue.severity === "error" && issue.row).map((issue) => issue.row)).size),
      errors,
      warnings,
      categorizedRows: rows.filter((row) => row.categoryId).length,
      judgeArtifacts: rows.filter((row) => row.judge).length,
      referenceArtifacts: rows.filter((row) => row.referenceLabel !== undefined).length,
    },
  };
}
