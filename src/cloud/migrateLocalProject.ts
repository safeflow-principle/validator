import { snapshotJudgeArtifact } from "../analysis/hashJudgeAnalysis";
import type { SafeFlowDatabase } from "../storage/database";
import { getSupabaseClient } from "./client";

export async function createCloudCopyOfLocalProject(database: SafeFlowDatabase, projectId: string, workspaceId: string): Promise<string> {
  const archive = await database.getProjectArchive(projectId);
  if (!archive) throw new Error("Local project not found.");
  if (archive.project.workspaceMode !== "LOCAL") throw new Error("Only an explicit Local Workspace project can be copied.");
  if (archive.project.status === "HUMAN_FINALIZED" || archive.project.status === "UNBLINDED") {
    throw new Error("Cloud migration of finalized immutable snapshots is not enabled yet. Export a full local backup instead.");
  }
  const judgeArtifacts = await Promise.all(archive.judgeArtifacts.map(snapshotJudgeArtifact));
  const bundle = {
    project: archive.project,
    items: archive.items,
    annotations: archive.annotations,
    judgeArtifacts,
    referenceArtifacts: archive.referenceArtifacts,
    importRun: archive.importRuns[0] ?? null,
  };
  const { data, error } = await getSupabaseClient().rpc("create_cloud_project_copy", { target_workspace_id: workspaceId, bundle });
  if (error) throw error;
  return data as string;
}

