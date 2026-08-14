import { describe, expect, it } from "vitest";
import { createEvidenceSpan, evidenceSegments } from "./evidence";

describe("evidence spans", () => {
  it("preserves UTF-16 offsets for Unicode and multiline response text", () => {
    const response = "First line 🙂 café\n第二行 evidence\nFinal line";
    const selected = "🙂 café\n第二行";
    const start = response.indexOf(selected);
    const span = createEvidenceSpan(response, start, start + selected.length);
    expect(span).toEqual({ start, end: start + selected.length, text: selected });
    const restored = JSON.parse(JSON.stringify(span));
    expect(evidenceSegments(response, [restored]).map((segment) => segment.text).join("")).toBe(response);
    expect(response.slice(restored.start, restored.end)).toBe(selected);
  });

  it("rejects stale or invalid evidence offsets", () => {
    expect(() => createEvidenceSpan("short", -1, 2)).toThrow(/outside/);
    expect(() => evidenceSegments("response", [{ start: 0, end: 4, text: "wrong" }])).toThrow(/do not match/);
  });
});
