import Ajv2020 from "ajv/dist/2020.js";
import benchmarkPackSchema from "../../schemas/benchmark-pack.schema.json";
import backupSchema from "../../schemas/safeflow-project-backup.schema.json";
import { createEvidenceSpan } from "../annotation/evidence";
import { LOCAL_VALIDATOR_ID } from "../core/constants";
import { calculateHumanProgress } from "../projects/progress";
import type { SafeFlowDatabase } from "../storage/database";
import type { ProjectArchiveRecords, SafeFlowProjectBackup } from "./types";

export class SafeFlowBackupValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid SafeFlow project backup: ${details.join("; ")}`);
    this.name = "SafeFlowBackupValidationError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { uri: true } });
ajv.addSchema(benchmarkPackSchema);
const validateBackup = ajv.compile(backupSchema);

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
  if (!validateBackup(value)) {
    throw new SafeFlowBackupValidationError(
      (validateBackup.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  const backup = structuredClone(value) as unknown as SafeFlowProjectBackup;
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
    schemaVersion: "1.0",
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
    },
    isolatedArtifacts: {
      judgeArtifacts: archive.judgeArtifacts,
      referenceArtifacts: archive.referenceArtifacts,
    },
  });
}

export async function restoreSafeFlowProjectBackup(database: SafeFlowDatabase, value: unknown): Promise<string> {
  const backup = parseSafeFlowProjectBackup(value);
  const records: ProjectArchiveRecords = {
    project: backup.workflow.project,
    items: backup.workflow.items,
    annotations: backup.workflow.annotations,
    importRuns: backup.workflow.source.importRuns,
    benchmarkPack: backup.workflow.benchmark.pack,
    judgeArtifacts: backup.isolatedArtifacts.judgeArtifacts,
    referenceArtifacts: backup.isolatedArtifacts.referenceArtifacts,
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
