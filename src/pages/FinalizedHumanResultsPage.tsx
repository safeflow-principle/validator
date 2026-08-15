import { useEffect, useMemo, useState } from "react";
import type { HumanValidationFinalization } from "../finalization/types";
import { openSafeFlowDatabase } from "../storage/database";
import { createJudgeAnalysis } from "../analysis/createJudgeAnalysis";
import type { ProjectStatus } from "../core/types";

export function FinalizedHumanResultsPage({ projectId }: { projectId: string }) {
  const [finalization, setFinalization] = useState<HumanValidationFinalization | null>();
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>();
  const [confirmingUnblind, setConfirmingUnblind] = useState(false);
  const [unblindAcknowledged, setUnblindAcknowledged] = useState(false);
  const [unblindError, setUnblindError] = useState<string>();
  const [unblinding, setUnblinding] = useState(false);
  useEffect(() => {
    void openSafeFlowDatabase().then(async (database) => {
      try {
        const [snapshot, detail] = await Promise.all([database.getLatestHumanValidationFinalization(projectId), database.getProjectDetail(projectId)]);
        setFinalization(snapshot ?? null); setProjectStatus(detail?.project.status);
      }
      finally { database.close(); }
    });
  }, [projectId]);
  const summary = useMemo(() => {
    if (!finalization) return undefined;
    const scores = new Map<string, number>();
    const confidence = { high: 0, medium: 0, low: 0 };
    let flagged = 0;
    for (const annotation of finalization.annotations) {
      scores.set(annotation.labelId, (scores.get(annotation.labelId) ?? 0) + 1);
      confidence[annotation.confidence] += 1;
      if (annotation.needsReview) flagged += 1;
    }
    const scoreLabels = [...scores.keys()].sort((left, right) => {
      const leftNumber = Number(left); const rightNumber = Number(right);
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? leftNumber - rightNumber : left.localeCompare(right);
    });
    return { scores, scoreLabels, confidence, flagged };
  }, [finalization]);
  if (finalization === undefined) return <main className="loading-screen"><p>Opening finalized human results…</p></main>;
  if (finalization === null || !summary) return <main className="project-shell"><h1>No human finalization found</h1><a href={`/projects/${projectId}`}>Back to project</a></main>;
  async function unblind() {
    if (!finalization || !unblindAcknowledged) return;
    setUnblinding(true); setUnblindError(undefined);
    const database = await openSafeFlowDatabase();
    try {
      const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true });
      window.location.assign(`/projects/${projectId}/analysis/${analysis.id}`);
    } catch (error) {
      setUnblindError(error instanceof Error ? error.message : "Could not create the judge analysis.");
      setUnblinding(false);
    } finally { database.close(); }
  }
  return <main className="project-shell finalized-results-shell">
    <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/projects/${projectId}`}>Project overview</a></header>
    <span className="eyebrow">Finalized Human Results · read only</span><h1>Human validation finalized</h1>
    <p className="page-intro">This view reads the immutable human finalization snapshot. Automated-judge and reference artifacts remain isolated.</p>
    <div className="page-actions">{projectStatus === "UNBLINDED" ? <a className="primary-link" href={`/projects/${projectId}`}>View Judge Comparison</a> : <button className="primary-button" onClick={() => setConfirmingUnblind(true)} type="button">Compare With Automated Judge</button>}</div>
    <section className="results-hero finalized-summary">
      <div><strong>{finalization.annotations.length}</strong><span>Finalized items</span></div>
      <div><strong>{summary.flagged}</strong><span>Flagged</span></div>
      <div><strong>{finalization.snapshotHash.slice(0, 8)}…</strong><span>Snapshot ID</span></div>
    </section>
    <div className="results-grid">
      <section className="result-card"><h2>Human score distribution</h2><dl>{summary.scoreLabels.map((label) => <div key={label}><dt>Score {label}</dt><dd>{summary.scores.get(label) ?? 0}</dd></div>)}</dl></section>
      <section className="result-card"><h2>Confidence</h2><dl><div><dt>High</dt><dd>{summary.confidence.high}</dd></div><div><dt>Medium</dt><dd>{summary.confidence.medium}</dd></div><div><dt>Low</dt><dd>{summary.confidence.low}</dd></div></dl></section>
    </div>
    <section className="finalized-item-list"><h2>Finalized human annotations</h2>{finalization.annotations.map((annotation) => <details className="finalized-item" key={annotation.itemId}>
      <summary><span>{annotation.externalItemId ?? annotation.promptId ?? annotation.itemId}</span><strong>Human score {annotation.labelId}</strong><small>{annotation.confidence} confidence</small></summary>
      <div className="finalized-item-body"><section><h3>Prompt</h3><p>{annotation.prompt}</p><h3>Response</h3><p>{annotation.response}</p></section><dl>
        <div><dt>Category</dt><dd>{annotation.categoryId ?? "Uncategorized"}</dd></div><div><dt>Final human score</dt><dd>{annotation.labelId}</dd></div><div><dt>Confidence</dt><dd>{annotation.confidence}</dd></div><div><dt>Reasoning</dt><dd>{annotation.reasoning ?? "—"}</dd></div><div><dt>Evidence</dt><dd>{annotation.evidenceSpans.length ? annotation.evidenceSpans.map((span) => `${span.quotedText} (${span.startOffset}–${span.endOffset})`).join(" · ") : "—"}</dd></div><div><dt>Needs review</dt><dd>{annotation.needsReview ? "Yes" : "No"}</dd></div><div><dt>Annotation revision</dt><dd>{annotation.annotationRevision}</dd></div><div><dt>Finalized</dt><dd>{new Date(annotation.finalizedAt).toLocaleString()}</dd></div>
      </dl></div>
    </details>)}</section>
    <details className="technical-provenance"><summary>View technical provenance</summary><dl><div><dt>Human finalization ID</dt><dd>{finalization.id}</dd></div><div><dt>Snapshot SHA-256</dt><dd>{finalization.snapshotHash}</dd></div><div><dt>Source SHA-256</dt><dd>{finalization.source.fileSha256}</dd></div><div><dt>Benchmark</dt><dd>{finalization.benchmark.benchmarkId} {finalization.benchmark.benchmarkVersion}</dd></div><div><dt>Benchmark pack</dt><dd>{finalization.benchmark.benchmarkPackVersion}</dd></div><div><dt>Rubric</dt><dd>{finalization.benchmark.rubricVersion}</dd></div></dl></details>
    {confirmingUnblind && <div className="modal-backdrop" role="presentation"><section aria-labelledby="unblind-title" aria-modal="true" className="confirmation-dialog" role="dialog">
      <span className="eyebrow">Permanent workflow transition</span><h2 id="unblind-title">Compare with the automated judge?</h2>
      <p>This intentionally unblinds automated-judge scores and reasoning for human finalization <code>{finalization.id}</code>. The frozen human labels will not change.</p>
      <p>The comparison will become an immutable local analysis run tied to human snapshot <code>{finalization.snapshotHash.slice(0, 12)}…</code>.</p>
      <label className="confirmation-check"><input checked={unblindAcknowledged} onChange={(event) => setUnblindAcknowledged(event.target.checked)} type="checkbox" /> I understand that this specific finalized human snapshot will be unblinded.</label>
      {unblindError && <p className="error-banner" role="alert">{unblindError}</p>}
      <div className="page-actions"><button className="secondary-button" disabled={unblinding} onClick={() => setConfirmingUnblind(false)} type="button">Cancel</button><button className="primary-button" disabled={!unblindAcknowledged || unblinding} onClick={() => void unblind()} type="button">{unblinding ? "Creating analysis…" : "Unblind and Compare"}</button></div>
    </section></div>}
  </main>;
}
