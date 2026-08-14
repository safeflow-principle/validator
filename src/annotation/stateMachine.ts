import type { Annotation, AnnotationValue, BenchmarkPack, EvidenceSpan } from "../core/types";

export type SaveIntent = "autosave" | "draft-exit" | "previous" | "submit";

export type AnnotationState =
  | { value: "loading" }
  | { value: "editing"; annotation: Annotation; dirty: boolean; error?: string }
  | { value: "saving"; annotation: Annotation; intent: SaveIntent }
  | { value: "save-error"; annotation: Annotation; error: string };

export type AnnotationEvent =
  | { type: "LOADED"; annotation: Annotation }
  | { type: "ANSWER_CHANGED"; fieldId: string; value: AnnotationValue }
  | { type: "NOTES_CHANGED"; notes: string }
  | { type: "EVIDENCE_ADDED"; span: EvidenceSpan }
  | { type: "EVIDENCE_REMOVED"; index: number }
  | { type: "SAVE_REQUESTED"; intent?: Exclude<SaveIntent, "submit"> }
  | { type: "SUBMIT_REQUESTED"; pack: BenchmarkPack }
  | { type: "SAVE_SUCCEEDED"; annotation: Annotation }
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

function editable(annotation: Annotation): Annotation {
  if (annotation.status === "draft") return annotation;
  const { submittedAt: _submittedAt, ...draft } = annotation;
  return { ...draft, status: "draft" };
}

function change(state: Extract<AnnotationState, { value: "editing" | "save-error" }>, annotation: Annotation): AnnotationState {
  return { value: "editing", annotation: editable(annotation), dirty: true };
}

export function annotationTransition(state: AnnotationState, event: AnnotationEvent): AnnotationState {
  if (state.value === "loading") return event.type === "LOADED" ? { value: "editing", annotation: event.annotation, dirty: false } : state;

  if (state.value === "saving") {
    if (event.type === "SAVE_FAILED") return { value: "save-error", annotation: state.annotation, error: event.message };
    if (event.type === "SAVE_SUCCEEDED") return { value: "editing", annotation: event.annotation, dirty: false };
    return state;
  }

  switch (event.type) {
    case "LOADED":
      return { value: "editing", annotation: event.annotation, dirty: false };
    case "ANSWER_CHANGED":
      return change(state, { ...state.annotation, answers: { ...state.annotation.answers, [event.fieldId]: event.value } });
    case "NOTES_CHANGED":
      return change(state, { ...state.annotation, notes: event.notes });
    case "EVIDENCE_ADDED": {
      const overlaps = state.annotation.evidenceSpans.some((span) => event.span.start < span.end && event.span.end > span.start);
      if (overlaps) return { value: "editing", annotation: state.annotation, dirty: state.value === "editing" && state.dirty, error: "Evidence selections cannot overlap." };
      return change(state, { ...state.annotation, evidenceSpans: [...state.annotation.evidenceSpans, event.span].sort((a, b) => a.start - b.start) });
    }
    case "EVIDENCE_REMOVED":
      return change(state, { ...state.annotation, evidenceSpans: state.annotation.evidenceSpans.filter((_, index) => index !== event.index) });
    case "SAVE_REQUESTED":
      return { value: "saving", annotation: state.annotation, intent: event.intent ?? "autosave" };
    case "SUBMIT_REQUESTED": {
      const missing = missingRequiredFields(event.pack, state.annotation);
      if (missing.length) return { value: "editing", annotation: state.annotation, dirty: state.value === "editing" && state.dirty, error: `Complete required fields: ${missing.join(", ")}` };
      return { value: "saving", annotation: state.annotation, intent: "submit" };
    }
    case "SAVE_FAILED":
      return { value: "save-error", annotation: state.annotation, error: event.message };
    default:
      return state;
  }
}
