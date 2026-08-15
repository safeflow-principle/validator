import type { ImportRun, JudgeArtifact, Project, ReferenceArtifact, ValidationItem } from "../core/types";
import type { DatasetFormat, DatasetMapping, ImportPreflight } from "./types";

export interface LocalImportBundle {
  project: Project;
  items: ValidationItem[];
  judgeArtifacts: JudgeArtifact[];
  referenceArtifacts: ReferenceArtifact[];
  importRun: ImportRun;
}

export interface BuildImportBundleOptions {
  projectName: string;
  benchmarkPackId: string;
  benchmarkPackVersion: string;
  sourceName: string;
  sourceSha256: string;
  format: DatasetFormat;
  mapping: DatasetMapping;
  now?: string;
  createId?: () => string;
}

export function buildLocalImportBundle(
  preflight: ImportPreflight,
  options: BuildImportBundleOptions,
): LocalImportBundle {
  if (!preflight.ready) throw new Error("Cannot import a dataset that has preflight errors.");
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const projectId = createId();
  const project: Project = {
    id: projectId,
    name: options.projectName.trim() || options.sourceName,
    benchmarkPackId: options.benchmarkPackId,
    benchmarkPackVersion: options.benchmarkPackVersion,
    workspaceMode: "LOCAL",
    status: "READY",
    createdAt: now,
    updatedAt: now,
  };
  const items: ValidationItem[] = [];
  const judgeArtifacts: JudgeArtifact[] = [];
  const referenceArtifacts: ReferenceArtifact[] = [];
  for (const row of preflight.rows) {
    const itemId = createId();
    items.push({
      id: itemId,
      projectId,
      externalId: row.externalId,
      prompt: row.prompt,
      response: row.response,
      ...(row.categoryId ? { categoryId: row.categoryId } : {}),
      metadata: {
        ...row.metadata,
        importSourceRow: row.sourceRow,
        ...(row.benchmarkPromptId ? { benchmarkPromptId: row.benchmarkPromptId } : {}),
        fieldProvenance: row.fieldProvenance,
      },
      createdAt: now,
    });
    if (row.judge) {
      judgeArtifacts.push({
        id: createId(),
        itemId,
        judgeId: "imported-automated-judge",
        score: row.judge.score,
        ...(row.judge.reasoning ? { reasoning: row.judge.reasoning } : {}),
        metadata: { importSourceRow: row.sourceRow },
        createdAt: now,
      });
    }
    if (row.referenceLabel !== undefined) {
      referenceArtifacts.push({ id: createId(), itemId, label: row.referenceLabel, provenance: "Imported local dataset", createdAt: now });
    }
  }
  const importRun: ImportRun = {
    id: createId(),
    projectId,
    sourceName: options.sourceName,
    status: "complete",
    itemCount: items.length,
    errors: [],
    warnings: preflight.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    format: options.format,
    mapping: Object.fromEntries(Object.entries(options.mapping).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    sourceSha256: options.sourceSha256,
    createdAt: now,
  };
  return { project, items, judgeArtifacts, referenceArtifacts, importRun };
}
