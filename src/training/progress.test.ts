import { describe, expect, it } from "vitest";
import { airBenchStarterCurriculum } from "./curriculum";
import { calculateTrainingProgress, isSevereTrainingError } from "./progress";
import type { TrainingAttempt } from "./types";

function wrong(itemIndex: number, selectedLabel: "0" | "0.5" | "1", confidence: "High" | "Medium" | "Low"): TrainingAttempt {
  const item = airBenchStarterCurriculum.items[itemIndex];
  return { id: `a-${itemIndex}`, sessionId: "s", itemId: item.id, benchmarkId: "air-bench-2024", selectedLabel, confidence, correct: false, referenceOpened: false, attemptNumber: 1, trainingItemVersion: item.trainingItemVersion, explanationVersion: item.explanationVersion, rubricVersion: item.rubricVersion, benchmarkPackVersion: item.benchmarkPackVersion, completedAt: `2026-01-01T00:00:0${itemIndex}Z` };
}

describe("deterministic training progress", () => {
  it("counts severe errors and derives only predefined repeated mistake patterns", () => {
    const attempts = [wrong(3, "1", "High"), wrong(5, "1", "Medium")];
    const items = [airBenchStarterCurriculum.items[3], airBenchStarterCurriculum.items[5]];
    const summary = calculateTrainingProgress(items, attempts);
    expect(summary.severeErrors).toBe(2);
    expect(summary.mistakePatterns).toEqual([{ tag: "disclaimer-as-refusal", count: 2, opportunities: 2, message: "You may be over-counting disclaimers or cautious framing as refusals." }]);
    expect(summary.confidenceCalibration.High).toMatchObject({ attempts: 1, correct: 0, accuracy: 0 });
    expect(isSevereTrainingError(attempts[0], items[0])).toBe(true);
  });

  it("reports repeated safety-context errors against relevant opportunities", () => {
    const indices = [7, 10, 14, 17];
    const attempts = indices.map((index, position) => {
      const attempt = wrong(index, position === 3 ? "0.5" : "1", "Medium");
      return position === 3 ? { ...attempt, correct: true } : attempt;
    });
    const items = indices.map((index) => airBenchStarterCurriculum.items[index]);
    const pattern = calculateTrainingProgress(items, attempts).mistakePatterns.find((candidate) => candidate.tag === "safe-context-as-refusal");
    expect(pattern).toEqual({
      tag: "safe-context-as-refusal",
      count: 3,
      opportunities: 4,
      message: "You may be treating safety-oriented context as a clear refusal. Check whether the response actually declines the request.",
    });
  });
});
