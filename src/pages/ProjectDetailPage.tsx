import { useEffect, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { ProjectDetail } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>();
  useEffect(() => {
    const databasePromise = openSafeFlowDatabase();
    void databasePromise.then(async (database) => {
      try { setDetail((await database.getProjectDetail(projectId)) ?? null); } finally { database.close(); }
    });
  }, [projectId]);
  if (detail === undefined) return <main className="loading-screen"><p>Loading project…</p></main>;
  if (detail === null) return <main className="project-shell"><h1>Project not found</h1><a href="/projects">Back to projects</a></main>;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const complete = detail.progress.submitted === detail.progress.total && detail.progress.total > 0;
  const started = detail.progress.drafts + detail.progress.submitted > 0;
  return (
    <main className="project-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/projects">All projects</a></header>
      <span className="status-pill">{detail.project.status}</span>
      <h1>{detail.project.name}</h1>
      {complete && <section className="completion-banner"><h2>Human validation complete</h2><p>Automated-judge results remain blinded. Review the human annotations before the later finalization milestone.</p></section>}

      <section className="detail-grid">
        <article className="detail-card"><h2>Project information</h2><dl>
          <div><dt>Benchmark</dt><dd>{pack.name}</dd></div>
          <div><dt>Benchmark-pack version</dt><dd>{detail.project.benchmarkPackVersion}</dd></div>
          <div><dt>Source filename</dt><dd>{detail.sourceName}</dd></div>
          <div><dt>Source SHA-256</dt><dd className="hash-value">{detail.importRun?.sourceSha256 ?? "Unavailable for legacy import"}</dd></div>
          <div><dt>Import timestamp</dt><dd>{detail.importRun ? new Date(detail.importRun.createdAt).toLocaleString() : "Unavailable"}</dd></div>
          <div><dt>Total items</dt><dd>{detail.progress.total}</dd></div>
        </dl></article>
        <article className="detail-card"><h2>Human-validation progress</h2><dl className="progress-breakdown">
          <div><dt>Unseen</dt><dd>{detail.progress.unseen}</dd></div>
          <div><dt>In progress / draft</dt><dd>{detail.progress.drafts}</dd></div>
          <div><dt>Submitted</dt><dd>{detail.progress.submitted}</dd></div>
          <div><dt>Flagged</dt><dd>{detail.progress.flagged}</dd></div>
          <div><dt>Low confidence</dt><dd>{detail.progress.lowConfidence}</dd></div>
          <div><dt>Skipped</dt><dd>{detail.progress.skipped}</dd></div>
        </dl><progress max="100" value={detail.progress.percentComplete} /><strong>{detail.progress.percentComplete}% complete</strong></article>
      </section>
      <div className="page-actions">
        {!complete && <a className="primary-link" href={`/projects/${projectId}/annotate`}>{started ? "Resume Validation" : "Start Validation"}</a>}
        <a className={complete ? "primary-link" : "secondary-link button-link"} href={`/projects/${projectId}/review`}>{complete ? "Review Before Finalization" : "Review Annotations"}</a>
      </div>
    </main>
  );
}
