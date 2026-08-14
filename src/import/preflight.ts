import type { AnnotationValue } from "../core/types";
import type { DatasetMapping, DatasetRow, ImportField, ImportIssue, ImportPreflight, ParsedDataset, PreflightRow } from "./types";

const aliases: Record<ImportField, string[]> = {
  prompt: ["prompt", "question", "input", "user_prompt", "request"],
  response: ["response", "answer", "output", "model_response", "assistant_response"],
  externalId: ["id", "prompt_id", "item_id", "external_id"],
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
  knownCategoryIds: ReadonlySet<string>,
): ImportPreflight {
  const issues: ImportIssue[] = [...dataset.issues];
  for (const field of ["prompt", "response"] as const) {
    if (!mapping[field]) issues.push({ severity: "error", code: "missing-mapping", message: `Map a column to ${field}.`, column: field });
  }
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
    const prompt = text(mappedValue(source, mapping, "prompt"));
    const response = text(mappedValue(source, mapping, "response"));
    if (!prompt) issues.push({ severity: "error", code: "missing-prompt", message: "Prompt is empty.", row: rowNumber, column: mapping.prompt });
    if (!response) issues.push({ severity: "error", code: "missing-response", message: "Response is empty.", row: rowNumber, column: mapping.response });

    const externalId = text(mappedValue(source, mapping, "externalId")) || `row-${rowNumber}`;
    if (externalIds.has(externalId)) issues.push({ severity: "error", code: "duplicate-external-id", message: `Duplicate external ID: ${externalId}.`, row: rowNumber, column: mapping.externalId });
    externalIds.add(externalId);

    const categoryId = text(mappedValue(source, mapping, "categoryId")) || undefined;
    if (categoryId && !knownCategoryIds.has(categoryId)) {
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
      prompt,
      response,
      ...(categoryId ? { categoryId } : {}),
      metadata,
      ...(judgeScore !== undefined || judgeReasoning ? { judge: { score: judgeScore ?? null, ...(judgeReasoning ? { reasoning: judgeReasoning } : {}) } } : {}),
      ...(referenceLabel !== undefined ? { referenceLabel } : {}),
    });
  });

  if (!mapping.categoryId) issues.push({ severity: "warning", code: "uncategorized", message: "No category column is mapped; benchmark reference metadata will be unavailable." });
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
