import type { Annotation, AnnotationValue, BenchmarkPack } from "../core/types";

export type AnnotationState =
  | { value: "loading" }
  | { value: "editing"; annotation: Annotation; dirty: boolean; error?: string }
  | { value: "saving"; annotation: Annotation; finalizeAfterSave: boolean }
  | { value: "finalized"; annotation: Annotation };

export type AnnotationEvent =
  | { type: "LOADED"; annotation: Annotation }
  | { type: "ANSWER_CHANGED"; fieldId: string; value: AnnotationValue }
  | { type: "NOTES_CHANGED"; notes: string }
  | { type: "SAVE_REQUESTED" }
  | { type: "FINALIZE_REQUESTED"; pack: BenchmarkPack }
  | { type: "SAVE_SUCCEEDED"; savedAt: string }
  | { type: "SAVE_FAILED"; message: string };

export const initialAnnotationState: AnnotationState = { value: "loading" };

export function missingRequiredFields(pack: BenchmarkPack, annotation: Annotation): string[] {
  return pack.annotation.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = annotation.answers[field.id];
      return value === undefined || value === null || value === "";
    })
    .map((field) => field.id);
}

export function annotationTransition(state: AnnotationState, event: AnnotationEvent): AnnotationState {
  if (state.value === "loading") {
    return event.type === "LOADED"
      ? { value: event.annotation.status === "finalized" ? "finalized" : "editing", annotation: event.annotation, dirty: false }
      : state;
  }

  if (state.value === "finalized") return state;

  if (state.value === "saving") {
    if (event.type === "SAVE_FAILED") {
      return { value: "editing", annotation: state.annotation, dirty: true, error: event.message };
    }
    if (event.type === "SAVE_SUCCEEDED") {
      const annotation: Annotation = {
        ...state.annotation,
        status: state.finalizeAfterSave ? "finalized" : "draft",
        revision: state.annotation.revision + 1,
        updatedAt: event.savedAt,
        ...(state.finalizeAfterSave ? { finalizedAt: event.savedAt } : {}),
      };
      return state.finalizeAfterSave
        ? { value: "finalized", annotation }
        : { value: "editing", annotation, dirty: false };
    }
    return state;
  }

  switch (event.type) {
    case "ANSWER_CHANGED":
      return {
        value: "editing",
        annotation: { ...state.annotation, answers: { ...state.annotation.answers, [event.fieldId]: event.value } },
        dirty: true,
      };
    case "NOTES_CHANGED":
      return { value: "editing", annotation: { ...state.annotation, notes: event.notes }, dirty: true };
    case "SAVE_REQUESTED":
      return { value: "saving", annotation: state.annotation, finalizeAfterSave: false };
    case "FINALIZE_REQUESTED": {
      const missing = missingRequiredFields(event.pack, state.annotation);
      if (missing.length) {
        return { ...state, error: `Complete required fields: ${missing.join(", ")}` };
      }
      return { value: "saving", annotation: state.annotation, finalizeAfterSave: true };
    }
    default:
      return state;
  }
}
