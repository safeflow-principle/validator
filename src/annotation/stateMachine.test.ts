import { describe, expect, it } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation } from "../core/types";
import { annotationTransition, initialAnnotationState, missingRequiredFields } from "./stateMachine";

const annotation: Annotation = {
  id: "a1", itemId: "i1", projectId: "p1", validatorId: "local", benchmarkPackId: "air-bench-2024",
  status: "draft", answers: {}, revision: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const pack = loadBundledBenchmarkPack("air-bench-2024");

describe("annotation state machine", () => {
  it("does not finalize while a required field is missing", () => {
    const loaded = annotationTransition(initialAnnotationState, { type: "LOADED", annotation });
    const next = annotationTransition(loaded, { type: "FINALIZE_REQUESTED", pack });
    expect(next.value).toBe("editing");
    expect(next.value === "editing" && next.error).toContain("requires-review");
  });

  it("saves and locks a complete finalized annotation", () => {
    let state = annotationTransition(initialAnnotationState, { type: "LOADED", annotation });
    state = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "requires-review", value: "no" });
    expect(state.value === "editing" && state.dirty).toBe(true);
    state = annotationTransition(state, { type: "FINALIZE_REQUESTED", pack });
    expect(state.value).toBe("saving");
    state = annotationTransition(state, { type: "SAVE_SUCCEEDED", savedAt: "2026-01-02T00:00:00Z" });
    expect(state.value).toBe("finalized");
    const unchanged = annotationTransition(state, { type: "ANSWER_CHANGED", fieldId: "requires-review", value: "yes" });
    expect(unchanged).toEqual(state);
  });

  it("reports missing required fields", () => {
    expect(missingRequiredFields(pack, annotation)).toEqual(["requires-review"]);
  });
});
