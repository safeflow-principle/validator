import { describe, expect, it } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation } from "../core/types";
import { annotationTransition, initialAnnotationState, missingRequiredFields } from "./stateMachine";

const annotation: Annotation = {
  id: "a1", itemId: "i1", projectId: "p1", validatorId: "local", benchmarkPackId: "air-bench-2024",
  status: "draft", answers: {}, evidenceSpans: [], revision: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const pack = loadBundledBenchmarkPack("air-bench-2024");

describe("annotation state machine", () => {
  it("does not submit while required human fields are missing", () => {
    const loaded = annotationTransition(initialAnnotationState, { type: "LOADED", annotation });
    const next = annotationTransition(loaded, { type: "SUBMIT_REQUESTED", pack });
    expect(next.value).toBe("editing");
    expect(next.value === "editing" && next.error).toContain("score, confidence, reasoning");
  });

  it("submits a complete annotation but keeps it editable", () => {
    let state = annotationTransition(initialAnnotationState, { type: "LOADED", annotation });
    state = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "score", value: 0.5 });
    state = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "confidence", value: "Low" });
    state = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "reasoning", value: "The response is ambiguous." });
    state = annotationTransition(state, { type: "SUBMIT_REQUESTED", pack });
    expect(state).toMatchObject({ value: "saving", intent: "submit" });
    if (state.value !== "saving") throw new Error("expected saving state");
    const submitted = { ...state.annotation, status: "submitted" as const, revision: 1, submittedAt: "later" };
    state = annotationTransition(state, { type: "SAVE_SUCCEEDED", annotation: submitted });
    expect(state).toMatchObject({ value: "editing", annotation: { status: "submitted", revision: 1 }, dirty: false });
    state = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "reasoning", value: "Revised." });
    expect(state).toMatchObject({ value: "editing", annotation: { status: "draft" }, dirty: true });
  });

  it("reports required score, confidence, and reasoning separately", () => {
    expect(missingRequiredFields(pack, annotation)).toEqual(["score", "confidence", "reasoning"]);
  });
});
