import { useEffect, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { ProjectSummary } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";
import { parseSafeFlowProjectBackupText, restoreSafeFlowProjectBackup } from "../backup/projectBackup";

function benchmarkName(id: string): string {
  try { return loadBundledBenchmarkPack(id).name; } catch { return id; }
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>();
  const [error, setError] = useState<string>();
  const [restoring, setRestoring] = useState(false);

  async function load() {
    const database = await openSafeFlowDatabase();
    try { setProjects(await database.listProjectSummaries()); } finally { database.close(); }
  }

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load projects.")); }, []);

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`Delete “${project.project.name}” and all of its local validation data? This cannot be undone.`)) return;
    const database = await openSafeFlowDatabase();
    try { await database.deleteProject(project.project.id); } finally { database.close(); }
    await load();
  }

  async function restoreBackup(file: File | undefined) {
    if (!file || restoring) return;
    setRestoring(true); setError(undefined);
    try {
      const backup = parseSafeFlowProjectBackupText(await file.text());
      const database = await openSafeFlowDatabase();
      let projectId: string;
      try { projectId = await restoreSafeFlowProjectBackup(database, backup); }
      finally { database.close(); }
      window.location.assign(`/projects/${projectId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore the local backup.");
      setRestoring(false);
    }
  }

  return (
    <main className="project-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><div className="card-actions"><a className="secondary-link button-link" href="/cloud">Cloud Workspace</a><a className="primary-link compact" href="/settings/data">Import dataset</a></div></header>
      <span className="eyebrow">LOCAL</span>
      <h1>Projects</h1>
      <p className="page-intro">Project data remains in this browser and is not transmitted to SafeFlow or third parties.</p>
      <section className="backup-restore-card">
        <div><strong>Restore a local project backup</strong><p>Imports a versioned <code>.safeflow.json</code> file entirely in this browser.</p></div>
        <label className="secondary-link button-link file-button">
          {restoring ? "Restoring…" : "Import backup"}
          <input accept=".json,.safeflow.json,application/json" disabled={restoring} onChange={(event) => void restoreBackup(event.target.files?.[0])} type="file" />
        </label>
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {!projects ? <p>Loading local projects…</p> : projects.length === 0 ? (
        <section className="empty-state"><h2>No local projects yet</h2><p>Import a result file to begin independent validation.</p><a className="primary-link" href="/settings/data">Import a dataset</a></section>
      ) : (
        <div className="project-list">
          {projects.map((summary) => (
            <article className="project-card" key={summary.project.id}>
              <div><span className="status-pill">LOCAL · {summary.project.status}</span><h2>{summary.project.name}</h2><p>{benchmarkName(summary.project.benchmarkPackId)} · {summary.sourceName}</p></div>
              <dl className="project-stats">
                <div><dt>Items</dt><dd>{summary.progress.total}</dd></div>
                <div><dt>Annotated</dt><dd>{summary.progress.submitted}</dd></div>
                <div><dt>Remaining</dt><dd>{summary.progress.total - summary.progress.submitted}</dd></div>
                <div><dt>Complete</dt><dd>{summary.progress.percentComplete}%</dd></div>
              </dl>
              <progress aria-label={`${summary.project.name} completion`} max="100" value={summary.progress.percentComplete} />
              <p className="last-activity">Last activity {new Date(summary.lastActivityAt).toLocaleString()}</p>
              <div className="card-actions">
                <a className="secondary-link button-link" href={`/projects/${summary.project.id}`}>Open</a>
                <a className="secondary-link button-link" href={`/projects/${summary.project.id}/cloud-copy`}>Create Cloud Copy</a>
                <a className="primary-link button-link" href={summary.project.status === "UNBLINDED" ? `/projects/${summary.project.id}` : summary.project.status === "HUMAN_FINALIZED" ? `/projects/${summary.project.id}/finalized` : summary.project.status === "HUMAN_COMPLETE" ? `/projects/${summary.project.id}/review` : `/projects/${summary.project.id}/annotate`}>{summary.project.status === "UNBLINDED" ? "View comparison" : summary.project.status === "HUMAN_FINALIZED" ? "View finalized results" : "Resume validation"}</a>
                <button className="danger-button" onClick={() => void deleteProject(summary)} type="button">Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
