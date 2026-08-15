import { describe, expect, it } from "vitest";
import { evaluateHumanFinalizationEligibility } from "./eligibility";
import { finalizationSource } from "./testFixtures";

describe("human finalization eligibility", () => {
  it("A: accepts all included items with valid submitted annotations", () => {
    const source = finalizationSource();
    source.annotations.forEach((annotation) => { annotation.answers.confidence = "High"; annotation.answers["needs-review"] = false; });
    const result = evaluateHumanFinalizationEligibility(source);
    expect(result).toMatchObject({ eligible: true, summary: { ready: 3, incomplete: 0 } });
    expect(result.warnings).toEqual([]);
  });

  it("B: rejects a draft-only item", () => {
    const source = finalizationSource(); source.annotations[1].status = "draft"; delete source.annotations[1].submittedAt;
    const result = evaluateHumanFinalizationEligibility(source);
    expect(result.eligible).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "draft-only", itemId: "final-item-2" })]));
  });

  it("C: rejects an unseen item", () => {
    const source = finalizationSource(); source.annotations.pop();
    const result = evaluateHumanFinalizationEligibility(source);
    expect(result.eligible).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unseen-item", itemId: "final-item-3" })]));
  });

  it("D: allows low confidence with an acknowledgement warning", () => {
    const result = evaluateHumanFinalizationEligibility(finalizationSource());
    expect(result.eligible).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "low-confidence-annotations", count: 1, acknowledgementRequired: true })]));
  });

  it("E: allows needs-review with an acknowledgement warning", () => {
    const result = evaluateHumanFinalizationEligibility(finalizationSource());
    expect(result.eligible).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "flagged-annotations", count: 1, acknowledgementRequired: true })]));
  });

  it("F: rejects a skipped included item", () => {
    const source = finalizationSource(); source.annotations[0].answers.skipped = true;
    const result = evaluateHumanFinalizationEligibility(source);
    expect(result.eligible).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "skipped-included-item" })]));
  });

  it("groups precise benchmark, reasoning, evidence, and provenance errors by item", () => {
    const source = finalizationSource();
    source.annotations[0].answers.score = 99; source.annotations[0].answers.reasoning = "";
    source.annotations[0].evidenceSpans[0].text = "wrong"; source.annotations[0].rubricVersion = "old";
    const result = evaluateHumanFinalizationEligibility(source);
    expect(result.eligible).toBe(false);
    expect(result.summary).toMatchObject({ ready: 2, incomplete: 1 });
    expect(result.issues.filter((issue) => issue.itemId === "final-item-1").map((issue) => issue.code)).toEqual(expect.arrayContaining(["invalid-score", "missing-required-field", "invalid-evidence", "annotation-rubric-version"]));
  });
});
