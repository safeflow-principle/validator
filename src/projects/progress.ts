import type { Annotation, HumanValidationProgress, ProjectStatus, ValidationItem } from "../core/types";

function sourceOrder(item: ValidationItem): number {
  const value = item.metadata.importSourceRow;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function sortItemsBySourceOrder(items: readonly ValidationItem[]): ValidationItem[] {
  return [...items].sort((left, right) => sourceOrder(left) - sourceOrder(right) || left.id.localeCompare(right.id));
}

export function calculateHumanProgress(
  items: readonly Pick<ValidationItem, "id">[],
  annotations: readonly Annotation[],
): HumanValidationProgress {
  const includedIds = new Set(items.map((item) => item.id));
  const byItem = new Map(annotations.filter((annotation) => includedIds.has(annotation.itemId)).map((annotation) => [annotation.itemId, annotation]));
  const submitted = [...byItem.values()].filter((annotation) => annotation.status === "submitted").length;
  const drafts = [...byItem.values()].filter((annotation) => annotation.status === "draft").length;
  const total = items.length;
  return {
    total,
    unseen: Math.max(0, total - byItem.size),
    drafts,
    submitted,
    flagged: [...byItem.values()].filter((annotation) => annotation.answers["needs-review"] === true).length,
    lowConfidence: [...byItem.values()].filter((annotation) => annotation.answers.confidence === "Low").length,
    skipped: 0,
    percentComplete: total ? Math.round((submitted / total) * 100) : 0,
  };
}

export function statusAfterAnnotation(progress: HumanValidationProgress): ProjectStatus {
  if (progress.total > 0 && progress.submitted === progress.total) return "HUMAN_COMPLETE";
  return progress.drafts || progress.submitted ? "VALIDATING" : "READY";
}

export function findResumeItemId(
  orderedItems: readonly Pick<ValidationItem, "id">[],
  annotations: readonly Annotation[],
): string | undefined {
  const byItem = new Map(annotations.map((annotation) => [annotation.itemId, annotation]));
  const draft = orderedItems.find((item) => byItem.get(item.id)?.status === "draft");
  if (draft) return draft.id;
  return orderedItems.find((item) => byItem.get(item.id)?.status !== "submitted")?.id;
}
