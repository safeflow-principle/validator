import { useEffect, useMemo, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation, BlindedValidationItem, ProjectDetail } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";
import { evaluateHumanFinalizationEligibility } from "../finalization/eligibility";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import type { FinalizationEligibility } from "../finalization/types";

type Filter = "All" | "Flagged" | "Low confidence" | "Score 0" | "Score 0.5" | "Score 1" | "Incomplete";
const filters: Filter[] = ["All", "Flagged", "Low confidence", "Score 0", "Score 0.5", "Score 1", "Incomplete"];
const issueGroupTitles: Record<string, string> = {
  "unseen-item": "Unseen items", "draft-only": "Draft-only annotations", "skipped-included-item": "Skipped included items",
  "missing-required-field": "Missing required fields", "invalid-score": "Invalid human scores", "invalid-confidence": "Missing or invalid confidence",
  "invalid-evidence": "Invalid evidence", "annotation-benchmark-version": "Benchmark version mismatch", "annotation-rubric-version": "Rubric version mismatch",
};

export function ProjectReviewPage({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail>();
  const [items, setItems] = useState<BlindedValidationItem[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [eligibility, setEligibility] = useState<FinalizationEligibility>();
  const [confirming, setConfirming] = useState(false);
  const [acknowledgedRecord, setAcknowledgedRecord] = useState(false);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizationError, setFinalizationError] = useState<string>();
  useEffect(() => {
    void openSafeFlowDatabase().then(async (database) => {
      try {
        const [projectDetail, projectItems, humanAnnotations] = await Promise.all([
          database.getProjectDetail(projectId), database.getBlindedProjectItems(projectId), database.getProjectAnnotations(projectId),
        ]);
        if (!projectDetail) return;
        setDetail(projectDetail); setItems(projectItems); setAnnotations(humanAnnotations);
        try {
          const source = await database.getHumanFinalizationSource(projectId);
          if (source) setEligibility(evaluateHumanFinalizationEligibility(source));
        } catch {
          // Legacy/test projects without a persisted pack remain reviewable but cannot be finalized.
          setEligibility(undefined);
        }
        if (projectDetail.project.status !== "HUMAN_COMPLETE" && projectDetail.project.status !== "HUMAN_FINALIZED" && projectDetail.project.status !== "UNBLINDED") await database.setProjectStatus(projectId, "REVIEW");
      } finally { database.close(); }
    });
  }, [projectId]);
  const byItem = useMemo(() => new Map(annotations.map((annotation) => [annotation.itemId, annotation])), [annotations]);
  const visible = items.filter((item) => {
    const annotation = byItem.get(item.id);
    if (filter === "Flagged") return annotation?.answers["needs-review"] === true;
    if (filter === "Low confidence") return annotation?.answers.confidence === "Low";
    if (filter === "Incomplete") return annotation?.status !== "submitted";
    if (filter.startsWith("Score ")) return annotation?.answers.score === Number(filter.slice(6));
    return true;
  });
  const issueGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof eligibility>["issues"]>();
    for (const issue of eligibility?.issues ?? []) groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
    return [...groups.entries()];
  }, [eligibility]);
  if (!detail) return <main className="loading-screen"><p>Loading human annotations…</p></main>;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const complete = detail.progress.total > 0 && detail.progress.submitted === detail.progress.total;
  const finalized = detail.project.status === "HUMAN_FINALIZED" || detail.project.status === "UNBLINDED";
  async function finalize() {
    if (!acknowledgedRecord || (eligibility?.warnings.length && !acknowledgedWarnings) || finalizing) return;
    setFinalizing(true); setFinalizationError(undefined);
    const database = await openSafeFlowDatabase();
    try {
      await finalizeHumanValidation(database, projectId, { acknowledgeWarnings: acknowledgedWarnings });
      window.location.assign(`/projects/${projectId}/finalized`);
    } catch (error) {
      setFinalizationError(error instanceof Error ? error.message : "Human validation could not be finalized.");
      setFinalizing(false);
    } finally { database.close(); }
  }
  return (
    <main className="project-shell review-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/projects/${projectId}`}>Project overview</a></header>
      <span className="eyebrow">Human annotations only</span><h1>Review annotations</h1>
      {finalized ? <section className="completion-banner"><h2>Human validation finalized</h2><p>The immutable human-validation results are locked. Automated-judge results remain blinded.</p><a className="primary-link button-link" href={`/projects/${projectId}/finalized`}>View Finalized Human Results</a></section> : complete && <section className="completion-banner"><h2>Human validation complete</h2><p>{detail.progress.submitted} / {detail.progress.total} items submitted. Automated-judge results remain blinded.</p><strong>Review Before Finalization</strong></section>}
      {!finalized && complete && eligibility && <section className="detail-card finalization-card" aria-labelledby="finalization-heading">
        <span className="eyebrow">Human Validation Finalization</span><h2 id="finalization-heading">Create the immutable human record</h2>
        <p>Finalization freezes the human judgments used for later analysis. Changes to editable records cannot silently alter this snapshot.</p>
        <dl className="finalization-summary">
          <div><dt>Source rows</dt><dd>{eligibility.summary.sourceRows}</dd></div>
          <div><dt>Excluded</dt><dd>{eligibility.summary.excluded}</dd></div>
          <div><dt>Annotations ready</dt><dd>{eligibility.summary.ready}</dd></div>
          <div><dt>Flagged</dt><dd>{eligibility.summary.flagged}</dd></div>
          <div><dt>Low confidence</dt><dd>{eligibility.summary.lowConfidence}</dd></div>
          <div><dt>Medium-confidence flagged</dt><dd>{eligibility.summary.mediumConfidenceFlagged}</dd></div>
          <div><dt>Incomplete</dt><dd>{eligibility.summary.incomplete}</dd></div>
        </dl>
        {eligibility.warnings.length > 0 && <aside className="finalization-warning"><strong>Review states will be permanent.</strong><p>Some annotations are marked for review or low confidence. They can still be finalized, but these states will be recorded in the snapshot.</p><div className="card-actions"><button className="secondary-button" onClick={() => setFilter("Flagged")} type="button">Review flagged items</button><button className="secondary-button" onClick={() => setFilter("Low confidence")} type="button">Review low confidence</button></div></aside>}
        {!eligibility.eligible && <section className="finalization-errors" role="alert"><h3>Cannot finalize yet</h3><p>{eligibility.issues.length} issues need attention.</p>{issueGroups.map(([code, issues]) => <section key={code}><h4>{issueGroupTitles[code] ?? code.replaceAll("-", " ")}</h4><ul>{issues.map((issue, index) => <li key={`${issue.code}-${issue.itemId ?? index}`}>{issue.itemId ? <a href={`/projects/${projectId}/annotate?item=${issue.itemId}`}>{issue.externalItemId ?? issue.itemId}</a> : null} {issue.message}</li>)}</ul></section>)}</section>}
        <ul><li>Review flagged annotations</li><li>Review low-confidence annotations</li><li>Confirm your judgments are complete</li></ul>
        <button className="primary-button finalization-button" disabled={!eligibility.eligible} onClick={() => setConfirming(true)} type="button">Finalize Human Validation</button>
      </section>}
      <div className="filter-row" aria-label="Annotation filters">{filters.map((candidate) => <button aria-pressed={candidate === filter} key={candidate} onClick={() => setFilter(candidate)} type="button">{candidate}</button>)}</div>
      <div className="review-list">
        {visible.map((item) => {
          const annotation = byItem.get(item.id);
          const category = pack.categories.find((candidate) => candidate.id === item.categoryId);
          return <article className="review-card" key={item.id}>
            <div><span className="eyebrow">{item.externalId ?? item.id}</span><h2>{category?.name ?? item.categoryId ?? "Uncategorized"}</h2></div>
            <dl>
              <div><dt>Human score</dt><dd>{annotation?.answers.score ?? "Incomplete"}</dd></div>
              <div><dt>Confidence</dt><dd>{annotation?.answers.confidence ?? "—"}</dd></div>
              <div><dt>Reason</dt><dd>{annotation?.answers.reasoning ?? "—"}</dd></div>
              <div><dt>Evidence</dt><dd>{annotation?.evidenceSpans.length ? annotation.evidenceSpans.map((span) => span.text).join(" · ") : "—"}</dd></div>
              <div><dt>Flag</dt><dd>{annotation?.answers["needs-review"] === true ? "Needs review" : "No"}</dd></div>
            </dl>
            {!finalized && <a className="secondary-link button-link" href={`/projects/${projectId}/annotate?item=${item.id}`}>Open for editing</a>}
          </article>;
        })}
      </div>
      {confirming && <div className="modal-backdrop"><section aria-labelledby="confirm-finalization-title" aria-modal="true" className="confirmation-dialog" role="dialog">
        <h2 id="confirm-finalization-title">Finalize Human Validation?</h2>
        <p>Finalizing creates the immutable human-validation record used for later analysis. It preserves scores, confidence, reasoning, evidence, revisions, review flags, benchmark and rubric versions, dataset provenance, and the finalization timestamp.</p>
        <p>Changes made afterward will not silently alter this snapshot. Production annotation editing will be locked.</p>
        <label className="confirmation-check"><input checked={acknowledgedRecord} onChange={(event) => setAcknowledgedRecord(event.target.checked)} type="checkbox" /> <span>I understand that this creates the human-validation record used for analysis.</span></label>
        {Boolean(eligibility?.warnings.length) && <label className="confirmation-check"><input checked={acknowledgedWarnings} onChange={(event) => setAcknowledgedWarnings(event.target.checked)} type="checkbox" /> <span>I understand that flagged and low-confidence states will be permanently recorded.</span></label>}
        {finalizationError && <p className="error-message" role="alert">{finalizationError}</p>}
        <div className="dialog-actions"><button className="secondary-button" disabled={finalizing} onClick={() => setConfirming(false)} type="button">Cancel</button><button className="primary-button" disabled={!acknowledgedRecord || Boolean(eligibility?.warnings.length && !acknowledgedWarnings) || finalizing} onClick={() => void finalize()} type="button">{finalizing ? "Finalizing locally…" : "Finalize Human Validation"}</button></div>
      </section></div>}
    </main>
  );
}
