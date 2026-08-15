import { useEffect, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { ProjectSummary } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";
import { parseSafeFlowProjectBackupText, restoreSafeFlowProjectBackup } from "../backup/projectBackup";
import { ProjectStateBadge } from "../components/ProjectStateBadge";
import { cloudWorkspaceIsConfigured } from "../cloud/config";
import { getSupabaseClient } from "../cloud/client";
import { listCloudWorkspaces, SupabaseProjectRepository } from "../cloud/repositories";

function benchmarkName(id: string): string {
  try { return loadBundledBenchmarkPack(id).name; } catch { return id; }
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>();
  const [cloudProjects, setCloudProjects] = useState<ProjectSummary[]>();
  const [workspaceFilter, setWorkspaceFilter] = useState<"all" | "local" | "cloud">("local");
  const [error, setError] = useState<string>();
  const [restoring, setRestoring] = useState(false);

  async function load() {
    const database = await openSafeFlowDatabase();
    try { setProjects(await database.listProjectSummaries()); } finally { database.close(); }
  }

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load projects.")); }, []);

  useEffect(() => {
    if (workspaceFilter === "local" || cloudProjects) return;
    if (!cloudWorkspaceIsConfigured()) { setCloudProjects([]); return; }
    void getSupabaseClient().auth.getSession().then(async ({ data }) => {
      if (!data.session) { setCloudProjects([]); return; }
      const memberships = await listCloudWorkspaces();
      const summaries = await Promise.all(memberships.map(({ workspace }) => new SupabaseProjectRepository(workspace.id).listProjects()));
      setCloudProjects(summaries.flat());
    }).catch(() => setCloudProjects([]));
  }, [workspaceFilter, cloudProjects]);

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`Delete “${project.project.name}” and all of its local validation data? This cannot be undone.`)) return;
    const database = await openSafeFlowDatabase();
    try { await database.deleteProject(project.project.id); } finally { database.close(); }
    await load();
  }

  const visibleProjects = workspaceFilter === "local" ? (projects ?? []) : workspaceFilter === "cloud" ? (cloudProjects ?? []) : [...(projects ?? []), ...(cloudProjects ?? [])];

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
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><div className="card-actions"><a className="primary-link compact" href="/settings/data">Validate a Dataset</a></div></header>
      <span className="eyebrow">LOCAL</span>
      <h1>Projects</h1>
      <p className="page-intro">Continue an existing validation project or create a new one. Evaluation project data shown here remains in this browser.</p>
      <nav className="project-filters" aria-label="Project workspace filter"><button aria-pressed={workspaceFilter === "all"} onClick={() => setWorkspaceFilter("all")} type="button">All</button><button aria-pressed={workspaceFilter === "local"} onClick={() => setWorkspaceFilter("local")} type="button">Local</button><button aria-pressed={workspaceFilter === "cloud"} onClick={() => setWorkspaceFilter("cloud")} type="button">Cloud</button></nav>
      <section className="backup-restore-card">
        <div><strong>Restore a local project backup</strong><p>Imports a versioned <code>.safeflow.json</code> file entirely in this browser.</p></div>
        <label className="secondary-link button-link file-button">
          {restoring ? "Restoring…" : "Import backup"}
          <input accept=".json,.safeflow.json,application/json" disabled={restoring} onChange={(event) => void restoreBackup(event.target.files?.[0])} type="file" />
        </label>
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {!projects || (workspaceFilter !== "local" && !cloudProjects) ? <p>Loading projects…</p> : visibleProjects.length === 0 ? (
        <section className="empty-state"><h2>No validation projects yet</h2><p>Import evaluation results or practice AIR-BENCH scoring before you begin.</p><div className="card-actions empty-actions"><a className="primary-link" href="/settings/data">Validate a Dataset</a><a className="secondary-link button-link" href="/training/air-bench-2024">Try AIR-BENCH Training</a></div></section>
      ) : (
        <div className="project-list">
          {visibleProjects.map((summary) => {
            const cloud = summary.project.workspaceMode === "CLOUD";
            const basePath = cloud ? "/cloud/projects" : "/projects";
            return (
            <article className="project-card" key={summary.project.id}>
              <div><div className="badge-row"><span className="workspace-badge">{cloud ? "CLOUD" : "LOCAL"}</span><ProjectStateBadge state={summary.project.status} /></div><h2>{summary.project.name}</h2><p>{benchmarkName(summary.project.benchmarkPackId)}</p></div>
              <dl className="project-stats">
                <div><dt>Items</dt><dd>{summary.progress.total}</dd></div>
                <div><dt>Annotated</dt><dd>{summary.progress.submitted}</dd></div>
                <div><dt>Remaining</dt><dd>{summary.progress.total - summary.progress.submitted}</dd></div>
                <div><dt>Complete</dt><dd>{summary.progress.percentComplete}%</dd></div>
              </dl>
              <progress aria-label={`${summary.project.name} completion`} max="100" value={summary.progress.percentComplete} />
              <p className="last-activity">Last activity {new Date(summary.lastActivityAt).toLocaleString()}</p>
              <div className="card-actions">
                <a className="secondary-link button-link" href={`${basePath}/${summary.project.id}`}>Open</a>
                {!cloud && <a className="secondary-link button-link" href={`/projects/${summary.project.id}/cloud-copy`}>Create Cloud Copy</a>}
                <a className="primary-link button-link" href={cloud ? `${basePath}/${summary.project.id}` : summary.project.status === "UNBLINDED" ? `/projects/${summary.project.id}` : summary.project.status === "HUMAN_FINALIZED" ? `/projects/${summary.project.id}/finalized` : summary.project.status === "HUMAN_COMPLETE" ? `/projects/${summary.project.id}/review` : `/projects/${summary.project.id}/annotate`}>{cloud ? "Open cloud project" : summary.project.status === "UNBLINDED" ? "View comparison" : summary.project.status === "HUMAN_FINALIZED" ? "View finalized results" : "Resume validation"}</a>
                {!cloud && <button className="danger-button" onClick={() => void deleteProject(summary)} type="button">Delete</button>}
              </div>
            </article>
          );})}
        </div>
      )}
    </main>
  );
}
