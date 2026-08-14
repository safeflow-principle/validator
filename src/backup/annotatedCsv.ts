import type { Annotation, BlindedValidationItem } from "../core/types";

const columns = [
  "item_id", "prompt_id", "category_id", "prompt", "response", "annotation_status", "human_score",
  "confidence", "human_reasoning", "evidence_spans_json", "needs_review", "annotation_revision", "annotation_updated_at",
] as const;

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

export function createAnnotatedCsv(items: readonly BlindedValidationItem[], annotations: readonly Annotation[]): string {
  const byItem = new Map(annotations.map((annotation) => [annotation.itemId, annotation]));
  const rows = items.map((item) => {
    const annotation = byItem.get(item.id);
    return [
      item.id,
      item.externalId,
      item.categoryId,
      item.prompt,
      item.response,
      annotation?.status,
      annotation?.answers.score,
      annotation?.answers.confidence,
      annotation?.answers.reasoning,
      annotation ? JSON.stringify(annotation.evidenceSpans) : "",
      annotation?.answers["needs-review"] === true ? "true" : annotation ? "false" : "",
      annotation?.revision,
      annotation?.updatedAt,
    ];
  });
  return [columns.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}
