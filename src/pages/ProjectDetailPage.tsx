import { useEffect, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { ProjectDetail } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";
import { createAnnotatedCsv, createFinalizedHumanAnnotationsCsv } from "../backup/annotatedCsv";
import { downloadLocalText } from "../backup/download";
import { createSafeFlowProjectBackup, safeProjectFileStem, serializeSafeFlowProjectBackup } from "../backup/projectBackup";
import type { HumanValidationFinalization } from "../finalization/types";
import type { JudgeAnalysis } from "../analysis/types";

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>();
  const [exportStatus, setExportStatus] = useState<string>();
  const [finalization, setFinalization] = useState<HumanValidationFinalization>();
  const [judgeAnalysis, setJudgeAnalysis] = useState<JudgeAnalysis>();
  useEffect(() => {
    const databasePromise = openSafeFlowDatabase();
    void databasePromise.then(async (database) => {
      try {
        const [projectDetail, latestFinalization] = await Promise.all([database.getProjectDetail(projectId), database.getLatestHumanValidationFinalization(projectId)]);
        setDetail(projectDetail ?? null); setFinalization(latestFinalization);
        if (projectDetail?.project.status === "UNBLINDED") setJudgeAnalysis((await database.listJudgeAnalyses(projectId)).at(-1));
      } finally { database.close(); }
    });
  }, [projectId]);
  if (detail === undefined) return <main className="loading-screen"><p>Loading project…</p></main>;
  if (detail === null) return <main className="project-shell"><h1>Project not found</h1><a href="/projects">Back to projects</a></main>;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const projectName = detail.project.name;
  const complete = detail.progress.submitted === detail.progress.total && detail.progress.total > 0;
  const finalized = detail.project.status === "HUMAN_FINALIZED" || detail.project.status === "UNBLINDED";
  const unblinded = detail.project.status === "UNBLINDED";
  const started = detail.progress.drafts + detail.progress.submitted > 0;
  async function exportBackup() {
    setExportStatus("Preparing backup…");
    const database = await openSafeFlowDatabase();
    try {
      const backup = await createSafeFlowProjectBackup(database, projectId);
      downloadLocalText(serializeSafeFlowProjectBackup(backup), `${safeProjectFileStem(projectName)}.safeflow.json`, "application/json");
      setExportStatus("Backup downloaded locally");
    } catch (error) { setExportStatus(error instanceof Error ? error.message : "Backup export failed."); }
    finally { database.close(); }
  }
  async function exportCsv() {
    setExportStatus(finalized ? "Preparing finalized human CSV…" : "Preparing current annotations CSV…");
    const database = await openSafeFlowDatabase();
    try {
      if (finalized) {
        const latest = await database.getLatestHumanValidationFinalization(projectId);
        if (!latest) throw new Error("Finalized human snapshot is unavailable.");
        downloadLocalText(createFinalizedHumanAnnotationsCsv(latest), `${safeProjectFileStem(projectName)}-finalized-human-annotations.csv`, "text/csv;charset=utf-8");
        setExportStatus("Finalized human CSV downloaded locally");
      } else {
        const [items, annotations] = await Promise.all([database.getBlindedProjectItems(projectId), database.getProjectAnnotations(projectId)]);
        downloadLocalText(createAnnotatedCsv(items, annotations), `${safeProjectFileStem(projectName)}-current-human-annotations.csv`, "text/csv;charset=utf-8");
        setExportStatus("Current annotations CSV downloaded locally");
      }
    } catch (error) { setExportStatus(error instanceof Error ? error.message : "CSV export failed."); }
    finally { database.close(); }
  }
  return (
    <main className="project-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/projects">All projects</a></header>
      <span className="status-pill">{detail.project.status}</span>
      <h1>{detail.project.name}</h1>
      {finalized && finalization ? <section className="completion-banner"><h2>{unblinded ? "Judge comparison created" : "Human validation finalized"}</h2><p>{finalization.annotations.length} / {finalization.annotations.length} human annotations finalized. {unblinded ? "This project has been explicitly unblinded; its human labels remain frozen." : "Automated-judge results remain blinded."}</p><dl><div><dt>Finalized</dt><dd>{new Date(finalization.finalizedAt).toLocaleString()}</dd></div><div><dt>Human snapshot</dt><dd className="hash-value">{finalization.snapshotHash.slice(0, 8)}…</dd></div></dl></section> : complete && <section className="completion-banner"><h2>Human validation complete</h2><p>Automated-judge results remain blinded. Review the human annotations before finalization.</p></section>}

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
        {!complete && !finalized && <a className="primary-link" href={`/projects/${projectId}/annotate`}>{started ? "Resume Validation" : "Start Validation"}</a>}
        {finalized ? <a className={unblinded ? "secondary-link button-link" : "primary-link"} href={`/projects/${projectId}/finalized`}>View Finalized Human Results</a> : <a className={complete ? "primary-link" : "secondary-link button-link"} href={`/projects/${projectId}/review`}>{complete ? "Review Before Finalization" : "Review Annotations"}</a>}
        {unblinded && judgeAnalysis ? <a className="primary-link" href={`/projects/${projectId}/analysis/${judgeAnalysis.id}`}>View Judge Comparison</a> : finalized && <a className="secondary-link button-link" href={`/projects/${projectId}/finalized`}>Compare With Automated Judge</a>}
      </div>
      <section className="detail-card export-card">
        <h2>Local backup and inspection</h2>
        <p>The project backup preserves resumable local state. Judge and reference artifacts remain in an isolated section and are never included in the annotated CSV.</p>
        <div className="card-actions">
          <button className="secondary-button" onClick={() => void exportBackup()} type="button">Export .safeflow.json</button>
          <button className="secondary-button" onClick={() => void exportCsv()} type="button">{finalized ? "Export finalized human annotations" : "Export current annotations"}</button>
        </div>
        {exportStatus && <p className="status-copy" role="status">{exportStatus}</p>}
      </section>
    </main>
  );
}
