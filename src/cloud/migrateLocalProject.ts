import { snapshotJudgeArtifact } from "../analysis/hashJudgeAnalysis";
import { verifyJudgeAnalysis } from "../analysis/hashJudgeAnalysis";
import { verifyJudgeAnalysisReport } from "../analysis/hashJudgeAnalysisReport";
import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import type { SafeFlowDatabase } from "../storage/database";
import { getSupabaseClient } from "./client";

export async function createCloudCopyOfLocalProject(database: SafeFlowDatabase, projectId: string, workspaceId: string): Promise<string> {
  const archive = await database.getProjectArchive(projectId);
  if (!archive) throw new Error("Local project not found.");
  if (archive.project.workspaceMode !== "LOCAL") throw new Error("Only an explicit Local Workspace project can be copied.");
  for (const finalization of archive.humanValidationFinalizations) {
    if (!await verifyHumanValidationFinalizationHash(finalization)) throw new Error("The local human-finalization hash failed verification; nothing was uploaded.");
  }
  for (const analysis of archive.judgeAnalyses) {
    if (!await verifyJudgeAnalysis(analysis)) throw new Error("The local judge-analysis hash failed verification; nothing was uploaded.");
  }
  for (const report of archive.judgeAnalysisReports) {
    if (!await verifyJudgeAnalysisReport(report)) throw new Error("The local judge-report hash failed verification; nothing was uploaded.");
  }
  const judgeArtifacts = await Promise.all(archive.judgeArtifacts.map(snapshotJudgeArtifact));
  const bundle = {
    project: archive.project,
    items: archive.items,
    annotations: archive.annotations,
    judgeArtifacts,
    referenceArtifacts: archive.referenceArtifacts,
    importRun: archive.importRuns[0] ?? null,
    humanValidationFinalizations: archive.humanValidationFinalizations,
    judgeAnalyses: archive.judgeAnalyses,
    judgeAnalysisReports: archive.judgeAnalysisReports,
    auditEvents: archive.auditEvents,
  };
  const { data, error } = await getSupabaseClient().rpc("create_cloud_project_archive_copy", { target_workspace_id: workspaceId, bundle });
  if (error) throw error;
  return data as string;
}
