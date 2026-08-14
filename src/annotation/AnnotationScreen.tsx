import type { Annotation, BenchmarkPack, BlindedValidationItem } from "../core/types";
import type { AnnotationEvent, AnnotationState } from "./stateMachine";

export interface AnnotationScreenProps {
  item: BlindedValidationItem;
  pack: BenchmarkPack;
  state: Exclude<AnnotationState, { value: "loading" }>;
  dispatch: (event: AnnotationEvent) => void;
}

export function AnnotationScreen({ item, pack, state, dispatch }: AnnotationScreenProps) {
  const annotation: Annotation = state.annotation;
  const locked = state.value === "saving" || state.value === "finalized";
  const dirty = state.value === "editing" && state.dirty;

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
          <span className="eyebrow">Synthetic research item</span>
          <strong>Item 01</strong>
        </div>
        <div className="status-copy" role="status">
          {state.value === "saving" ? "Saving locally…" : state.value === "finalized" ? "Finalized" : dirty ? "Unsaved changes" : "Saved locally"}
        </div>
      </div>

      <div className="workspace-grid">
        <section className="item-panel" aria-labelledby="item-heading">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Evaluation material</span>
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
            <p>{item.response}</p>
          </article>
          <p className="blind-note">Judge outputs, reference labels, and other annotations are excluded from this view.</p>
        </section>

        <section className="rubric-panel" aria-labelledby="annotation-heading">
          <span className="eyebrow">{pack.name} · pack skeleton</span>
          <h2 id="annotation-heading">Independent annotation</h2>
          {pack.annotation.instructions.map((instruction, index) => (
            <p className="instruction" key={index}>{instruction.text}</p>
          ))}

          {pack.annotation.fields.map((field) => (
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
          ))}

          <label className="notes-field">
            <span>Validator notes <small>Optional</small></span>
            <textarea
              disabled={locked}
              onChange={(event) => dispatch({ type: "NOTES_CHANGED", notes: event.target.value })}
              placeholder="Record concise evidence for your decision…"
              rows={4}
              value={annotation.notes ?? ""}
            />
          </label>

          {state.value === "editing" && state.error && <p className="error-message" role="alert">{state.error}</p>}

          <div className="actions">
            <button className="secondary-button" disabled={locked || !dirty} onClick={() => dispatch({ type: "SAVE_REQUESTED" })} type="button">
              Save draft
            </button>
            <button className="primary-button" disabled={locked} onClick={() => dispatch({ type: "FINALIZE_REQUESTED", pack })} type="button">
              Finalize annotation
            </button>
          </div>
          <p className="finalize-note">Finalized annotations are immutable in this skeleton.</p>
        </section>
      </div>
    </main>
  );
}
