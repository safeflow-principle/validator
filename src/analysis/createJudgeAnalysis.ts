import type { AnnotationValue } from "../core/types";
import { canonicalizeFinalizationPayload } from "../finalization/canonicalize";
import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import type { SafeFlowDatabase } from "../storage/database";
import { hashJudgeAnalysis, hashJudgeArtifactSet, snapshotJudgeArtifact } from "./hashJudgeAnalysis";
import { JUDGE_ANALYSIS_SCHEMA_VERSION, type JudgeAnalysis, type JudgeAnalysisSourceRecords, type JudgeAnalysisStateToken, type PreparedJudgeAnalysis } from "./types";

export class JudgeAnalysisValidationError extends Error {
  constructor(message: string) { super(message); this.name = "JudgeAnalysisValidationError"; }
}

function scoresAgree(human: string | number, judge: AnnotationValue): boolean {
  if (typeof human === "number" && typeof judge === "number") return human === judge;
  return String(human) === String(judge);
}

export function judgeAnalysisStateToken(source: JudgeAnalysisSourceRecords, judgeId: string): JudgeAnalysisStateToken {
  return {
    projectId: source.project.id,
    projectStatus: source.project.status,
    projectUpdatedAt: source.project.updatedAt,
    finalizationId: source.finalization.id,
    finalizationHash: source.finalization.snapshotHash,
    judgeId,
    judgeArtifactState: source.judgeArtifacts
      .filter((artifact) => artifact.judgeId === judgeId)
      .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.id.localeCompare(right.id))
      .map((artifact) => canonicalizeFinalizationPayload(artifact)),
  };
}

export async function prepareJudgeAnalysis(
  database: SafeFlowDatabase,
  finalizationId: string,
  options: { judgeId?: string; now?: string; createId?: () => string; applicationVersion?: string } = {},
): Promise<PreparedJudgeAnalysis> {
  const source = await database.getJudgeAnalysisSource(finalizationId);
  if (!source) throw new JudgeAnalysisValidationError("Human finalization not found.");
  if (source.project.status !== "HUMAN_FINALIZED") {
    throw new JudgeAnalysisValidationError(source.project.status === "UNBLINDED" ? "This human finalization has already been unblinded." : "The project must be human-finalized before judge comparison.");
  }
  if (!await verifyHumanValidationFinalizationHash(source.finalization)) throw new JudgeAnalysisValidationError("Human finalization integrity verification failed.");
  const judgeIds = [...new Set(source.judgeArtifacts.map((artifact) => artifact.judgeId))].sort();
  const judgeId = options.judgeId ?? (judgeIds.length === 1 ? judgeIds[0] : undefined);
  if (!judgeId) throw new JudgeAnalysisValidationError(judgeIds.length ? "Choose which automated judge artifact set to compare." : "No automated judge artifacts are available for this finalization.");
  const artifacts = source.judgeArtifacts.filter((artifact) => artifact.judgeId === judgeId);
  const byItem = new Map<string, typeof artifacts>();
  for (const artifact of artifacts) byItem.set(artifact.itemId, [...(byItem.get(artifact.itemId) ?? []), artifact]);
  const invalid = source.finalization.annotations.filter((annotation) => (byItem.get(annotation.itemId)?.length ?? 0) !== 1);
  if (invalid.length) throw new JudgeAnalysisValidationError(`Judge ${judgeId} must have exactly one artifact for every finalized item. ${invalid.length} item(s) are missing or duplicated.`);
  const snapshots = await Promise.all(artifacts.map(snapshotJudgeArtifact));
  snapshots.sort((left, right) => left.itemId.localeCompare(right.itemId) || left.id.localeCompare(right.id));
  const judgeArtifactSetHash = await hashJudgeArtifactSet(snapshots);
  const createdAt = options.now ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const analysisId = createId();
  const snapshotByItem = new Map(snapshots.map((artifact) => [artifact.itemId, artifact]));
  const comparisons = source.finalization.annotations.map((human) => {
    const judge = snapshotByItem.get(human.itemId)!;
    const humanScore = human.numericValue ?? human.labelId;
    return {
      itemId: human.itemId,
      ...(human.externalItemId ? { externalItemId: human.externalItemId } : {}),
      sourceRowIndex: human.sourceRowIndex,
      humanLabelId: human.labelId,
      ...(human.numericValue !== undefined ? { humanNumericValue: human.numericValue } : {}),
      judgeScore: judge.score,
      exactAgreement: scoresAgree(humanScore, judge.score),
      judgeArtifactId: judge.id,
      ...(judge.reasoning ? { judgeReasoning: judge.reasoning } : {}),
    };
  });
  const exactAgreements = comparisons.filter((comparison) => comparison.exactAgreement).length;
  const payload: Omit<JudgeAnalysis, "analysisHash"> = {
    id: analysisId,
    schemaVersion: JUDGE_ANALYSIS_SCHEMA_VERSION,
    status: "COMPLETED",
    projectId: source.project.id,
    finalizationId: source.finalization.id,
    finalizationHash: source.finalization.snapshotHash,
    judgeId,
    judgeArtifactSetHash,
    judgeArtifacts: snapshots,
    comparisons,
    summary: {
      totalItems: comparisons.length,
      exactAgreements,
      disagreements: comparisons.length - exactAgreements,
      exactAgreementRate: comparisons.length ? exactAgreements / comparisons.length : 0,
    },
    createdAt,
    provenance: {
      application: "SafeFlow Human Validator",
      applicationVersion: options.applicationVersion ?? "0.1.0",
      localOnly: true,
      humanFinalizationId: source.finalization.id,
      humanFinalizationHash: source.finalization.snapshotHash,
      judgeArtifactSetHash,
    },
  };
  const analysis: JudgeAnalysis = { ...payload, analysisHash: await hashJudgeAnalysis(payload) };
  return {
    analysis,
    expectedState: judgeAnalysisStateToken(source, judgeId),
    auditEvent: {
      id: createId(), type: "judge_analysis_created", projectId: source.project.id, finalizationId,
      analysisId, createdAt,
      metadata: { finalizationHash: source.finalization.snapshotHash, judgeArtifactSetHash, analysisHash: analysis.analysisHash, judgeId, itemCount: comparisons.length },
    },
  };
}

export async function createJudgeAnalysis(database: SafeFlowDatabase, finalizationId: string, options: { confirmed: boolean; judgeId?: string; now?: string; createId?: () => string } ): Promise<JudgeAnalysis> {
  if (!options.confirmed) throw new JudgeAnalysisValidationError("Explicit confirmation is required before unblinding automated-judge results.");
  const prepared = await prepareJudgeAnalysis(database, finalizationId, options);
  await database.commitJudgeAnalysis(prepared);
  return prepared.analysis;
}
