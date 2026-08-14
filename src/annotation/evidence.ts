import type { EvidenceSpan } from "../core/types";

export function createEvidenceSpan(response: string, start: number, end: number): EvidenceSpan {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > response.length) {
    throw new Error("Evidence offsets are outside the response.");
  }
  return { start, end, text: response.slice(start, end) };
}

export function evidenceSegments(response: string, spans: readonly EvidenceSpan[]): Array<{ text: string; evidence: boolean }> {
  const sorted = [...spans].sort((left, right) => left.start - right.start);
  const segments: Array<{ text: string; evidence: boolean }> = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor || span.end > response.length || response.slice(span.start, span.end) !== span.text) {
      throw new Error("Stored evidence offsets do not match the response text.");
    }
    if (span.start > cursor) segments.push({ text: response.slice(cursor, span.start), evidence: false });
    segments.push({ text: span.text, evidence: true });
    cursor = span.end;
  }
  if (cursor < response.length) segments.push({ text: response.slice(cursor), evidence: false });
  return segments;
}
