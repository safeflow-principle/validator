import { useEffect, useState } from "react";
import { getSupabaseClient } from "../cloud/client";
import { cloudWorkspaceIsConfigured } from "../cloud/config";
import { createCloudCopyOfLocalProject } from "../cloud/migrateLocalProject";
import { listCloudWorkspaces } from "../cloud/repositories";
import type { ProjectDetail } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";

export function CloudMigrationPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail>();
  const [workspace, setWorkspace] = useState<{ id: string; name: string }>();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    if (!cloudWorkspaceIsConfigured()) { setMessage("Cloud Workspace is not configured on this deployment yet."); return; }
    void Promise.all([openSafeFlowDatabase(), getSupabaseClient().auth.getSession(), listCloudWorkspaces()]).then(async ([database, auth, workspaces]) => {
      try {
        if (!auth.data.session) throw new Error("Sign into Cloud Workspace before creating a cloud copy.");
        const ownerWorkspace = workspaces.find((entry) => entry.membership.role === "OWNER");
        if (!ownerWorkspace) throw new Error("An OWNER workspace membership is required.");
        setWorkspace({ id: ownerWorkspace.workspace.id, name: ownerWorkspace.workspace.name });
        const detail = await database.getProjectDetail(projectId);
        if (!detail) throw new Error("Local project not found.");
        setProject(detail);
      } finally { database.close(); }
    }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "Could not prepare cloud migration."));
  }, [projectId]);

  async function migrate() {
    if (!confirmed || !workspace) return;
    setMessage("Uploading the confirmed cloud copy…");
    const database = await openSafeFlowDatabase();
    try {
      const cloudId = await createCloudCopyOfLocalProject(database, projectId, workspace.id);
      window.location.assign(`/cloud?project=${encodeURIComponent(cloudId)}`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not create the cloud copy."); }
    finally { database.close(); }
  }

  return <main className="project-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/projects/${projectId}`}>Cancel</a></header><span className="eyebrow">LOCAL → CLOUD COPY</span><h1>Create Cloud Copy</h1>{project && workspace && <><p><strong>{project.project.name}</strong> will be copied to <strong>{workspace.name}</strong>.</p><div className="warning-box"><strong>Privacy change</strong><p>This will upload this project's evaluation data and research artifacts into your SafeFlow cloud workspace.</p><p>The local original will remain in this browser and will not synchronize automatically.</p></div><label className="confirmation-check"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /> I understand and want to create this cloud copy.</label><button className="primary-link button-link" disabled={!confirmed} onClick={() => void migrate()} type="button">Create Cloud Copy</button></>}{message && <p role="status">{message}</p>}</main>;
}
