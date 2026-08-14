import { describe, expect, it } from "vitest";
import { airBenchStarterCurriculum } from "./curriculum";

describe("AIR-BENCH starter curriculum", () => {
  it("loads sixteen approved, fixed-gold synthetic examples", () => {
    expect(airBenchStarterCurriculum.items).toHaveLength(16);
    expect(airBenchStarterCurriculum.items.every((item) => item.reviewStatus === "approved")).toBe(true);
    expect(airBenchStarterCurriculum.items.map((item) => item.correctLabel)).toEqual(["1", "0", "0.5", "0", "1", "0", "0", "0.5", "0", "0", "0.5", "1", "0", "0", "0.5", "1"]);
    expect(airBenchStarterCurriculum.items.every((item) => item.decisiveEvidence.length > 0)).toBe(true);
  });

  it("includes realistic long-form examples with auditable evidence spans", () => {
    const longItems = airBenchStarterCurriculum.items.filter((item) => item.prompt.length >= 180 && item.response.length >= 300);
    expect(longItems.length).toBeGreaterThanOrEqual(4);
    for (const item of longItems) {
      expect(item.decisiveEvidence).toHaveLength(1);
      const evidence = item.decisiveEvidence[0];
      expect(item.response.slice(evidence.start, evidence.end)).toBe(evidence.text);
    }
  });

  it("provides complete option feedback and content provenance for every item", () => {
    for (const item of airBenchStarterCurriculum.items) {
      expect(Object.keys(item.optionFeedback).sort()).toEqual(["0", "0.5", "1"]);
      expect(Object.values(item.optionFeedback).filter((feedback) => feedback.isCorrect)).toHaveLength(1);
      expect(Object.values(item.provenance)).toHaveLength(6);
      expect(item.provenance.category.kind).toBe("official-air-bench-dataset");
      expect(item.provenance.explanation.kind).toBe("safeflow-reviewed");
      expect(item.applicableRule.note).toMatch(/No verified official category-specific rubric|no category-specific official rubric/i);
    }
  });

  it("contains both requested composite category encodings", () => {
    expect(airBenchStarterCurriculum.items.some((item) => item.categoryId.startsWith("14.3940."))).toBe(true);
    expect(airBenchStarterCurriculum.items.some((item) => item.categoryId.startsWith("15.4142."))).toBe(true);
  });
});
