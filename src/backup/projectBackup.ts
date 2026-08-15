import { createEvidenceSpan } from "../annotation/evidence";
import { LOCAL_VALIDATOR_ID } from "../core/constants";
import { calculateHumanProgress } from "../projects/progress";
import type { SafeFlowDatabase } from "../storage/database";
import type { ProjectArchiveRecords, SafeFlowProjectBackup } from "./types";
import { validateSafeFlowProjectBackup } from "../generated/schemaValidators.js";
import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import { verifyJudgeAnalysis } from "../analysis/hashJudgeAnalysis";
import { verifyJudgeAnalysisReport } from "../analysis/hashJudgeAnalysisReport";

export class SafeFlowBackupValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid SafeFlow project backup: ${details.join("; ")}`);
    this.name = "SafeFlowBackupValidationError";
  }
}

function assertUnique(values: readonly string[], label: string, errors: string[]) {
  if (new Set(values).size !== values.length) errors.push(`${label} IDs must be unique.`);
}

function validateRelationships(backup: SafeFlowProjectBackup): string[] {
  const errors: string[] = [];
  const { project, items, annotations, source, benchmark, progress } = backup.workflow;
  const itemIds = new Set(items.map((item) => item.id));
  assertUnique(items.map((item) => item.id), "Item", errors);
  assertUnique(annotations.map((annotation) => annotation.id), "Annotation", errors);
  assertUnique(source.importRuns.map((run) => run.id), "Import run", errors);
  assertUnique(backup.isolatedArtifacts.judgeArtifacts.map((artifact) => artifact.id), "Judge artifact", errors);
  assertUnique(backup.isolatedArtifacts.referenceArtifacts.map((artifact) => artifact.id), "Reference artifact", errors);
  assertUnique(backup.workflow.humanValidationFinalizations.map((finalization) => finalization.id), "Human finalization", errors);
  assertUnique(backup.workflow.judgeAnalyses.map((analysis) => analysis.id), "Judge analysis", errors);
  assertUnique(backup.workflow.judgeAnalysisReports.map((report) => report.id), "Judge analysis report", errors);
  assertUnique(backup.workflow.auditEvents.map((event) => event.id), "Audit event", errors);

  if (project.benchmarkPackId !== benchmark.packId || project.benchmarkPackVersion !== benchmark.packVersion) {
    errors.push("Project benchmark identity does not match the backup benchmark identity.");
  }
  if (benchmark.pack.id !== benchmark.packId || benchmark.pack.version !== benchmark.packVersion || benchmark.rubricVersion !== benchmark.pack.version) {
    errors.push("Embedded benchmark pack and rubric versions do not match the backup manifest.");
  }
  if (items.some((item) => item.projectId !== project.id)) errors.push("Every item must belong to the exported project.");
  if (annotations.some((annotation) => annotation.projectId !== project.id || !itemIds.has(annotation.itemId))) {
    errors.push("Every annotation must reference an item in the exported project.");
  }
  if (source.importRuns.some((run) => run.projectId !== project.id)) errors.push("Every import run must belong to the exported project.");
  if (backup.isolatedArtifacts.judgeArtifacts.some((artifact) => !itemIds.has(artifact.itemId))) {
    errors.push("Every isolated judge artifact must reference an exported item.");
  }
  if (backup.isolatedArtifacts.referenceArtifacts.some((artifact) => !itemIds.has(artifact.itemId))) {
    errors.push("Every isolated reference artifact must reference an exported item.");
  }
  if (backup.workflow.humanValidationFinalizations.some((finalization) => finalization.projectId !== project.id)) errors.push("Every human finalization must belong to the exported project.");
  if (backup.workflow.auditEvents.some((event) => event.projectId !== project.id)) errors.push("Every audit event must belong to the exported project.");
  if ((project.status === "HUMAN_FINALIZED" || project.status === "UNBLINDED") && backup.workflow.humanValidationFinalizations.length !== 1) errors.push("A finalized project backup must contain exactly one human finalization.");
  if (project.status !== "HUMAN_FINALIZED" && project.status !== "UNBLINDED" && backup.workflow.humanValidationFinalizations.length) errors.push("A non-finalized project cannot contain a human finalization.");
  if (project.status === "UNBLINDED" && backup.workflow.judgeAnalyses.length !== 1) errors.push("An UNBLINDED project backup must contain exactly one judge analysis.");
  if (project.status !== "UNBLINDED" && backup.workflow.judgeAnalyses.length) errors.push("Only an UNBLINDED project may contain a judge analysis.");
  for (const finalization of backup.workflow.humanValidationFinalizations) {
    if (finalization.annotations.some((annotation) => !itemIds.has(annotation.itemId))) errors.push("Every finalized human annotation must reference an exported item.");
    const event = backup.workflow.auditEvents.find((candidate) => candidate.type === "human_validation_finalized" && candidate.finalizationId === finalization.id);
    if (!event || event.type !== "human_validation_finalized" || event.metadata.snapshotHash !== finalization.snapshotHash) errors.push("Every human finalization must have a matching project audit event.");
  }
  for (const analysis of backup.workflow.judgeAnalyses) {
    const finalization = backup.workflow.humanValidationFinalizations.find((candidate) => candidate.id === analysis.finalizationId);
    if (!finalization || finalization.snapshotHash !== analysis.finalizationHash) errors.push("Every judge analysis must reference the exact exported human finalization hash.");
    const event = backup.workflow.auditEvents.find((candidate) => candidate.type === "judge_analysis_created" && candidate.analysisId === analysis.id);
    if (!event || event.type !== "judge_analysis_created" || event.metadata.analysisHash !== analysis.analysisHash) errors.push("Every judge analysis must have a matching audit event.");
  }
  for (const report of backup.workflow.judgeAnalysisReports) {
    const analysis = backup.workflow.judgeAnalyses.find((candidate) => candidate.id === report.analysisId);
    if (!analysis || analysis.analysisHash !== report.analysisHash || analysis.finalizationId !== report.finalizationId) errors.push("Every judge analysis report must reference the exact exported judge analysis.");
    const event = backup.workflow.auditEvents.find((candidate) => candidate.type === "judge_analysis_report_created" && candidate.reportId === report.id);
    if (!event || event.type !== "judge_analysis_report_created" || event.metadata.reportHash !== report.reportHash) errors.push("Every judge analysis report must have a matching audit event.");
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const annotation of annotations) {
    const item = itemById.get(annotation.itemId);
    if (!item) continue;
    for (const span of annotation.evidenceSpans) {
      try {
        const validated = createEvidenceSpan(item.response, span.start, span.end);
        if (validated.text !== span.text) throw new Error("Evidence text does not match offsets.");
      }
      catch { errors.push(`Annotation ${annotation.id} contains an invalid evidence span.`); }
    }
  }
  const calculated = calculateHumanProgress(items, annotations.filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID));
  if (JSON.stringify(calculated) !== JSON.stringify(progress)) errors.push("Stored progress does not match the exported items and local annotations.");
  const primaryRun = source.importRuns[0];
  if (primaryRun && (source.fileName !== primaryRun.sourceName || (source.sha256 && source.sha256 !== primaryRun.sourceSha256))) {
    errors.push("Source filename or SHA-256 does not match the primary import record.");
  }
  return errors;
}

export function parseSafeFlowProjectBackup(value: unknown): SafeFlowProjectBackup {
  if (!validateSafeFlowProjectBackup(value)) {
    throw new SafeFlowBackupValidationError(
      (validateSafeFlowProjectBackup.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  const raw = structuredClone(value) as unknown as SafeFlowProjectBackup & { schemaVersion: "1.0" | "1.1" | "1.2" | "1.3"; workflow: SafeFlowProjectBackup["workflow"] & { humanValidationFinalizations?: SafeFlowProjectBackup["workflow"]["humanValidationFinalizations"]; judgeAnalyses?: SafeFlowProjectBackup["workflow"]["judgeAnalyses"]; judgeAnalysisReports?: SafeFlowProjectBackup["workflow"]["judgeAnalysisReports"]; auditEvents?: SafeFlowProjectBackup["workflow"]["auditEvents"] } };
  const backup: SafeFlowProjectBackup = {
    ...raw,
    schemaVersion: "1.3",
    workflow: {
      ...raw.workflow,
      project: { ...raw.workflow.project, workspaceMode: raw.workflow.project.workspaceMode ?? "LOCAL" },
      humanValidationFinalizations: raw.workflow.humanValidationFinalizations ?? [],
      judgeAnalyses: raw.workflow.judgeAnalyses ?? [],
      judgeAnalysisReports: raw.workflow.judgeAnalysisReports ?? [],
      auditEvents: raw.workflow.auditEvents ?? [],
    },
  };
  const relationshipErrors = validateRelationships(backup);
  if (relationshipErrors.length) throw new SafeFlowBackupValidationError(relationshipErrors);
  return backup;
}

export function parseSafeFlowProjectBackupText(text: string): SafeFlowProjectBackup {
  try { return parseSafeFlowProjectBackup(JSON.parse(text) as unknown); }
  catch (error) {
    if (error instanceof SafeFlowBackupValidationError) throw error;
    throw new SafeFlowBackupValidationError([error instanceof Error ? error.message : "File is not valid JSON."]);
  }
}

export async function createSafeFlowProjectBackup(
  database: SafeFlowDatabase,
  projectId: string,
  exportedAt = new Date().toISOString(),
): Promise<SafeFlowProjectBackup> {
  const archive = await database.getProjectArchive(projectId);
  if (!archive) throw new Error("Project not found.");
  const primaryRun = archive.importRuns[0];
  const progress = calculateHumanProgress(
    archive.items,
    archive.annotations.filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID),
  );
  return parseSafeFlowProjectBackup({
    schemaVersion: "1.3",
    kind: "safeflow-project-backup",
    exportedAt,
    provenance: {
      application: "SafeFlow Human Validator",
      storageMode: "persistent-local",
      source: "local-browser-project-export",
    },
    workflow: {
      project: archive.project,
      source: {
        fileName: primaryRun?.sourceName ?? "Local dataset",
        ...(primaryRun?.sourceSha256 ? { sha256: primaryRun.sourceSha256 } : {}),
        importRuns: archive.importRuns,
      },
      benchmark: {
        packId: archive.benchmarkPack.id,
        packVersion: archive.benchmarkPack.version,
        rubricVersion: archive.benchmarkPack.version,
        pack: archive.benchmarkPack,
      },
      progress,
      items: archive.items,
      annotations: archive.annotations,
      humanValidationFinalizations: archive.humanValidationFinalizations,
      judgeAnalyses: archive.judgeAnalyses,
      judgeAnalysisReports: archive.judgeAnalysisReports,
      auditEvents: archive.auditEvents,
    },
    isolatedArtifacts: {
      judgeArtifacts: archive.judgeArtifacts,
      referenceArtifacts: archive.referenceArtifacts,
    },
  });
}

export async function restoreSafeFlowProjectBackup(database: SafeFlowDatabase, value: unknown): Promise<string> {
  const backup = parseSafeFlowProjectBackup(value);
  for (const finalization of backup.workflow.humanValidationFinalizations) {
    if (!await verifyHumanValidationFinalizationHash(finalization)) {
      throw new SafeFlowBackupValidationError(["Human-validation finalization integrity check failed. The finalized snapshot does not match its recorded hash."]);
    }
  }
  for (const analysis of backup.workflow.judgeAnalyses) {
    if (!await verifyJudgeAnalysis(analysis)) throw new SafeFlowBackupValidationError(["Judge-analysis integrity check failed. The immutable analysis does not match its recorded hashes."]);
  }
  for (const report of backup.workflow.judgeAnalysisReports) {
    if (!await verifyJudgeAnalysisReport(report)) throw new SafeFlowBackupValidationError(["Judge-analysis report integrity check failed. The immutable report does not match its recorded hash."]);
  }
  const records: ProjectArchiveRecords = {
    project: backup.workflow.project,
    items: backup.workflow.items,
    annotations: backup.workflow.annotations,
    importRuns: backup.workflow.source.importRuns,
    benchmarkPack: backup.workflow.benchmark.pack,
    judgeArtifacts: backup.isolatedArtifacts.judgeArtifacts,
    referenceArtifacts: backup.isolatedArtifacts.referenceArtifacts,
    humanValidationFinalizations: backup.workflow.humanValidationFinalizations,
    judgeAnalyses: backup.workflow.judgeAnalyses,
    judgeAnalysisReports: backup.workflow.judgeAnalysisReports,
    auditEvents: backup.workflow.auditEvents,
  };
  await database.restoreProjectArchive(records);
  return records.project.id;
}

export function serializeSafeFlowProjectBackup(backup: SafeFlowProjectBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function safeProjectFileStem(name: string): string {
  const stem = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return stem || "safeflow-project";
}
