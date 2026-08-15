import { LOCAL_VALIDATOR_ID } from "../core/constants";
import type { Annotation, AnnotationField, AnnotationValue, ValidationItem } from "../core/types";
import type { FinalizationEligibility, FinalizationIssue, HumanFinalizationSourceRecords } from "./types";

function itemIssue(item: ValidationItem, code: string, message: string, field?: string): FinalizationIssue {
  return { code, message, itemId: item.id, ...(item.externalId ? { externalItemId: item.externalId } : {}), ...(field ? { field } : {}) };
}

function validOption(field: AnnotationField, value: AnnotationValue | undefined): boolean {
  return field.options?.some((option) => Object.is(option.value, value)) ?? false;
}

export function evaluateHumanFinalizationEligibility(source: HumanFinalizationSourceRecords): FinalizationEligibility {
  const { project, items, annotations, importRuns, benchmarkPack } = source;
  const issues: FinalizationIssue[] = [];
  const localAnnotations = annotations.filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID);
  const byItem = new Map<string, Annotation[]>();
  for (const annotation of localAnnotations) byItem.set(annotation.itemId, [...(byItem.get(annotation.itemId) ?? []), annotation]);
  const itemIds = new Set(items.map((item) => item.id));
  const scoreField = benchmarkPack.annotation.fields.find((field) => field.id === "score");
  const confidenceField = benchmarkPack.annotation.fields.find((field) => field.id === "confidence");

  if (project.status !== "HUMAN_COMPLETE") issues.push({ code: "project-not-complete", message: "Project must be HUMAN_COMPLETE before finalization." });
  if (!project.benchmarkPackId || !project.benchmarkPackVersion) issues.push({ code: "missing-benchmark-version", message: "Project benchmark-pack provenance is missing." });
  if (benchmarkPack.id !== project.benchmarkPackId || benchmarkPack.version !== project.benchmarkPackVersion) {
    issues.push({ code: "benchmark-pack-mismatch", message: "The installed benchmark pack does not match the project benchmark-pack version." });
  }
  const primaryImport = [...importRuns].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  if (!primaryImport?.sourceName || !primaryImport.sourceSha256 || !/^[a-fA-F0-9]{64}$/.test(primaryImport.sourceSha256)) {
    issues.push({ code: "missing-source-provenance", message: "Project source filename and SHA-256 provenance are required for finalization." });
  }
  if (!items.length) issues.push({ code: "no-included-items", message: "The project has no included validation items." });
  if (localAnnotations.some((annotation) => !itemIds.has(annotation.itemId))) {
    issues.push({ code: "orphan-annotation", message: "A local annotation references an item outside the included validation population." });
  }

  for (const item of items) {
    const candidates = byItem.get(item.id) ?? [];
    if (candidates.length !== 1) {
      issues.push(itemIssue(item, candidates.length ? "multiple-active-annotations" : "unseen-item", candidates.length ? "Item has more than one active local-validator annotation." : "Item has no saved human annotation."));
      continue;
    }
    const annotation = candidates[0];
    if (annotation.status !== "submitted") {
      issues.push(itemIssue(item, "draft-only", "Item has only a draft annotation."));
      continue;
    }
    if (annotation.answers.skipped === true) issues.push(itemIssue(item, "skipped-included-item", "A skipped included item must be annotated or explicitly excluded with a reason before finalization."));
    if (!Number.isInteger(annotation.revision) || annotation.revision < 1 || !annotation.submittedAt) {
      issues.push(itemIssue(item, "inconsistent-revision", "Submitted annotation revision or submission timestamp is internally inconsistent."));
    }
    if (annotation.projectId !== project.id || annotation.itemId !== item.id) {
      issues.push(itemIssue(item, "annotation-relationship", "Annotation does not reference the expected project and item."));
    }
    if (annotation.benchmarkPackId !== project.benchmarkPackId) {
      issues.push(itemIssue(item, "annotation-benchmark", "Annotation benchmark ID does not match the project.", "benchmarkPackId"));
    }
    if (annotation.benchmarkPackVersion !== project.benchmarkPackVersion) {
      issues.push(itemIssue(item, "annotation-benchmark-version", "Annotation benchmark-pack version does not match the project.", "benchmarkPackVersion"));
    }
    if (annotation.rubricVersion !== benchmarkPack.version) {
      issues.push(itemIssue(item, "annotation-rubric-version", "Annotation rubric version does not match the expected rubric.", "rubricVersion"));
    }
    for (const field of benchmarkPack.annotation.fields.filter((field) => field.required)) {
      const value = annotation.answers[field.id];
      if (value === undefined || value === null || value === "") issues.push(itemIssue(item, "missing-required-field", `Required annotation field “${field.label}” is missing.`, field.id));
      else if (field.type === "single-choice" && !validOption(field, value)) issues.push(itemIssue(item, "invalid-field-value", `Annotation field “${field.label}” has an invalid benchmark value.`, field.id));
    }
    if (!scoreField || !validOption(scoreField, annotation.answers.score)) issues.push(itemIssue(item, "invalid-score", "Human score is not valid for the current benchmark pack.", "score"));
    if (!confidenceField || !validOption(confidenceField, annotation.answers.confidence)) issues.push(itemIssue(item, "invalid-confidence", "Confidence is not valid for the current benchmark pack.", "confidence"));
    const sourceRow = item.metadata.importSourceRow;
    if (!Number.isInteger(sourceRow) || (sourceRow as number) < 1) issues.push(itemIssue(item, "missing-source-row", "Item source-row provenance is missing or invalid."));
    for (const span of annotation.evidenceSpans) {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > item.response.length || item.response.slice(span.start, span.end) !== span.text) {
        issues.push(itemIssue(item, "invalid-evidence", "Evidence offsets and quoted response text do not match.", "evidenceSpans"));
      }
    }
  }

  const blockedItemIds = new Set(issues.flatMap((issue) => issue.itemId ? [issue.itemId] : []));
  const ready = items.filter((item) => !blockedItemIds.has(item.id) && (byItem.get(item.id) ?? [])[0]?.status === "submitted").length;
  const flaggedItems = items.filter((item) => (byItem.get(item.id) ?? [])[0]?.answers["needs-review"] === true);
  const lowConfidenceItems = items.filter((item) => (byItem.get(item.id) ?? [])[0]?.answers.confidence === "Low");
  const mediumFlagged = items.filter((item) => {
    const annotation = (byItem.get(item.id) ?? [])[0];
    return annotation?.answers.confidence === "Medium" && annotation.answers["needs-review"] === true;
  }).length;
  const warnings = [
    ...(flaggedItems.length ? [{ code: "flagged-annotations" as const, message: `${flaggedItems.length} annotations are marked “Needs review.”`, count: flaggedItems.length, itemIds: flaggedItems.map((item) => item.id), acknowledgementRequired: true as const }] : []),
    ...(lowConfidenceItems.length ? [{ code: "low-confidence-annotations" as const, message: `${lowConfidenceItems.length} annotations have low confidence.`, count: lowConfidenceItems.length, itemIds: lowConfidenceItems.map((item) => item.id), acknowledgementRequired: true as const }] : []),
  ];
  return {
    eligible: issues.length === 0,
    summary: {
      sourceRows: primaryImport?.itemCount ?? items.length,
      excluded: 0,
      included: items.length,
      ready,
      flagged: flaggedItems.length,
      lowConfidence: lowConfidenceItems.length,
      mediumConfidenceFlagged: mediumFlagged,
      incomplete: Math.max(0, items.length - ready),
    },
    issues,
    warnings,
  };
}
