import { useRef } from "react";
import type { Annotation, BenchmarkPack, BlindedValidationItem } from "../core/types";
import type { TaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import { BenchmarkReferencePanel } from "./BenchmarkReferencePanel";
import { createEvidenceSpan, evidenceSegments } from "./evidence";
import type { AnnotationEvent, AnnotationState } from "./stateMachine";

export interface AnnotationScreenProps {
  item: BlindedValidationItem;
  pack: BenchmarkPack;
  state: Exclude<AnnotationState, { value: "loading" }>;
  dispatch: (event: AnnotationEvent) => void;
  taxonomyReference?: TaxonomyReferenceView;
  position?: number;
  total?: number;
  projectName?: string;
  submittedCount?: number;
}

export function AnnotationScreen({ item, pack, state, dispatch, taxonomyReference, position = 1, total = 1, projectName = "Synthetic research item", submittedCount = 0 }: AnnotationScreenProps) {
  const annotation: Annotation = state.annotation;
  const locked = state.value === "saving";
  const dirty = state.value === "editing" && state.dirty;
  const responseRef = useRef<HTMLParagraphElement>(null);
  const category = item.categoryId ? pack.categories.find((candidate) => candidate.id === item.categoryId) : undefined;

  function addSelectedEvidence() {
    const root = responseRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    try {
      dispatch({ type: "EVIDENCE_ADDED", span: createEvidenceSpan(item.response, start, end) });
      selection.removeAllRanges();
    } catch {
      // Invalid DOM selections are ignored; stored evidence is validated independently.
    }
  }

  return (
    <main className="annotation-shell">
      <header className="annotation-header">
        <div>
          <a className="wordmark" href="/">SafeFlow</a>
          <span className="product-name">Human Validator</span>
        </div>
        <div className="privacy-status"><span aria-hidden="true">●</span> Local-only session</div>
      </header>

      <div className="progress-row" aria-label="Annotation progress">
        <div>
          <span className="eyebrow">{projectName}</span>
          <strong>Item {position} of {total}</strong>
          <small>{submittedCount} submitted</small>
          <progress aria-label="Human-validation completion" max={total} value={submittedCount} />
        </div>
        <div className="status-copy" role="status">
          {state.value === "saving" ? "Saving…" : state.value === "save-error" ? "Save failed" : dirty ? "Unsaved changes" : "Saved locally"}
        </div>
      </div>

      <div className="workspace-grid">
        <section className="item-panel" aria-labelledby="item-heading">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{item.externalId ?? item.id}</span>
              <h1 id="item-heading">Review the response</h1>
            </div>
            <span className="blind-badge">Blinded</span>
          </div>

          <article className="content-block prompt-block">
            <h2>Prompt</h2>
            <p>{item.prompt}</p>
          </article>
          <article className="content-block response-block">
            <h2>Assistant response</h2>
            <p ref={responseRef} data-testid="response-text">
              {evidenceSegments(item.response, annotation.evidenceSpans).map((segment, index) => (
                segment.evidence ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>
              ))}
            </p>
            <button className="evidence-button" disabled={locked} onClick={addSelectedEvidence} type="button">Add selected text as evidence</button>
            {annotation.evidenceSpans.length > 0 && (
              <ol className="evidence-list" aria-label="Evidence spans">
                {annotation.evidenceSpans.map((span, index) => (
                  <li key={`${span.start}-${span.end}`}>
                    <q>{span.text}</q>
                    <small>Offsets {span.start}–{span.end}</small>
                    <button aria-label={`Remove evidence ${index + 1}`} disabled={locked} onClick={() => dispatch({ type: "EVIDENCE_REMOVED", index })} type="button">Remove</button>
                  </li>
                ))}
              </ol>
            )}
          </article>
          <p className="blind-note">Judge outputs, reference labels, and other annotations are excluded from this view.</p>
        </section>

        <section className="rubric-panel" aria-labelledby="annotation-heading">
          <span className="eyebrow">{pack.name}</span>
          <h2 id="annotation-heading">Independent annotation</h2>
          {annotation.status === "submitted" && <p className="submitted-badge">Submitted · editable until project finalization</p>}
          {pack.annotation.instructions.map((instruction, index) => <p className="instruction" key={index}>{instruction.text}</p>)}

          {taxonomyReference && category && <BenchmarkReferencePanel category={category} pack={pack} reference={taxonomyReference} />}

          {pack.annotation.fields.map((field) => (
            field.type === "text" ? (
              <label className="notes-field" key={field.id}>
                <span>{field.label}{field.required && " *"}</span>
                {field.helpText?.text && <small className="field-help">{field.helpText.text}</small>}
                <textarea
                  disabled={locked}
                  onChange={(event) => dispatch({ type: "ANSWER_CHANGED", fieldId: field.id, value: event.target.value })}
                  rows={4}
                  value={String(annotation.answers[field.id] ?? "")}
                />
              </label>
            ) : field.type === "boolean" ? (
              <label className="flag-field" key={field.id}>
                <input
                  checked={annotation.answers[field.id] === true}
                  disabled={locked}
                  onChange={(event) => dispatch({ type: "ANSWER_CHANGED", fieldId: field.id, value: event.target.checked })}
                  type="checkbox"
                />
                <span><strong>{field.label}</strong>{field.helpText?.text && <small>{field.helpText.text}</small>}</span>
              </label>
            ) : (
              <fieldset key={field.id} disabled={locked}>
                <legend>{field.label}{field.required && <span aria-label="required"> *</span>}</legend>
                {field.helpText?.text && <p className="field-help">{field.helpText.text}</p>}
                {field.type === "single-choice" && (
                  <div className="choice-list">
                    {field.options?.map((option) => {
                      const id = `${field.id}-${String(option.value)}`;
                      return (
                        <label className="choice" htmlFor={id} key={String(option.value)}>
                          <input
                            checked={annotation.answers[field.id] === option.value}
                            id={id}
                            name={field.id}
                            onChange={() => dispatch({ type: "ANSWER_CHANGED", fieldId: field.id, value: option.value })}
                            type="radio"
                          />
                          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )
          ))}

          {(state.value === "save-error" || (state.value === "editing" && state.error)) && <p className="error-message" role="alert">{state.value === "save-error" ? state.error : state.error}</p>}

          <div className="annotation-nav-actions">
            <button className="secondary-button" disabled={locked || position <= 1} onClick={() => dispatch({ type: "SAVE_REQUESTED", intent: "previous" })} type="button">Previous</button>
            <button className="secondary-button" disabled={locked} onClick={() => dispatch({ type: "SAVE_REQUESTED", intent: "draft-exit" })} type="button">Save Draft & Exit</button>
            <button className="primary-button" disabled={locked} onClick={() => dispatch({ type: "SUBMIT_REQUESTED", pack })} type="button">{position === total ? "Submit item" : "Submit & Next"}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
