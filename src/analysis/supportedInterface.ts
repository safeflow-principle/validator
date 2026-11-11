import { parseHumanValidationFinalization } from "../finalization/schema";
import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import { parseJudgeAnalysis } from "./schema";
import { verifyJudgeAnalysis } from "./hashJudgeAnalysis";
import { AIR_BENCH_SCORE_ORDER, JUDGE_ANALYSIS_METHODOLOGY_VERSION, type AirBenchScore, type ConfusionMatrixCell, type ReliabilityMetrics } from "./reportTypes";
import { calculateReliabilityMetrics, parseAirBenchScore, type NumericComparison } from "./reportMetrics";

export const SUPPORTED_ANALYSIS_SCHEMA_VERSION = "1.0" as const;

export interface ScoreRecordInput {
  itemId: unknown;
  score: unknown;
}

export interface SupportedAnalysisReport {
  schemaVersion: typeof SUPPORTED_ANALYSIS_SCHEMA_VERSION;
  source: "score-records" | "verified-finalized-artifacts";
  methodology: {
    version: typeof JUDGE_ANALYSIS_METHODOLOGY_VERSION;
    scoreOrder: [0, 0.5, 1];
    confusionMatrixOrientation: "human-rows-judge-columns";
    weightedKappa: "linear-distance-0-1-2";
  };
  comparisons: Array<NumericComparison & {
    exactAgreement: boolean;
    absoluteError: number;
    directionalDifference: number;
  }>;
  metrics: ReliabilityMetrics;
  confusionMatrix: {
    rowDimension: "human";
    columnDimension: "automated-judge";
    labels: [0, 0.5, 1];
    cells: ConfusionMatrixCell[];
  };
  integrity?: {
    humanFinalizationId: string;
    humanFinalizationHash: string;
    judgeAnalysisId: string;
    judgeAnalysisHash: string;
    judgeArtifactSetHash: string;
    verified: true;
  };
}

export class SupportedAnalysisInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportedAnalysisInputError";
  }
}

function validatedScore(value: unknown, side: "human" | "judge", itemId: string): AirBenchScore {
  try {
    return parseAirBenchScore(value, side, itemId);
  } catch (error) {
    throw new SupportedAnalysisInputError(error instanceof Error ? error.message : `${side} score for item ${itemId} is invalid.`);
  }
}

function validateRecords(records: readonly ScoreRecordInput[], side: "human" | "judge"): Map<string, AirBenchScore> {
  if (!Array.isArray(records) || records.length === 0) throw new SupportedAnalysisInputError(`${side} records must be a non-empty array.`);
  const result = new Map<string, AirBenchScore>();
  for (const [index, record] of records.entries()) {
    if (typeof record !== "object" || record === null || Array.isArray(record)) throw new SupportedAnalysisInputError(`${side} record ${index + 1} must be an object.`);
    if (typeof record.itemId !== "string" || !record.itemId.trim()) throw new SupportedAnalysisInputError(`${side} record ${index + 1} has a missing or invalid item ID.`);
    const itemId = record.itemId.trim();
    if (result.has(itemId)) throw new SupportedAnalysisInputError(`${side} records contain duplicate item ID ${itemId}.`);
    result.set(itemId, validatedScore(record.score, side, itemId));
  }
  return result;
}

function confusionMatrix(rows: NumericComparison[]): SupportedAnalysisReport["confusionMatrix"] {
  const cells = AIR_BENCH_SCORE_ORDER.flatMap((humanScore) => AIR_BENCH_SCORE_ORDER.map((judgeScore) => {
    const itemIds = rows.filter((row) => row.human === humanScore && row.judge === judgeScore).map((row) => row.itemId);
    return { humanScore, judgeScore, count: itemIds.length, itemIds };
  }));
  return { rowDimension: "human", columnDimension: "automated-judge", labels: [...AIR_BENCH_SCORE_ORDER], cells };
}

export function analyzeScoreRecords(
  humanRecords: readonly ScoreRecordInput[],
  judgeRecords: readonly ScoreRecordInput[],
  options: { source?: SupportedAnalysisReport["source"]; integrity?: SupportedAnalysisReport["integrity"] } = {},
): SupportedAnalysisReport {
  const human = validateRecords(humanRecords, "human");
  const judge = validateRecords(judgeRecords, "judge");
  const missingJudge = [...human.keys()].filter((itemId) => !judge.has(itemId));
  const missingHuman = [...judge.keys()].filter((itemId) => !human.has(itemId));
  if (missingJudge.length || missingHuman.length) {
    const details = [
      missingJudge.length ? `missing judge IDs: ${missingJudge.join(", ")}` : "",
      missingHuman.length ? `missing human IDs: ${missingHuman.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new SupportedAnalysisInputError(`Human and judge item IDs must match exactly (${details}).`);
  }
  const rows = [...human.entries()].map(([itemId, humanScore]) => ({ itemId, human: humanScore, judge: judge.get(itemId)! }));
  return {
    schemaVersion: SUPPORTED_ANALYSIS_SCHEMA_VERSION,
    source: options.source ?? "score-records",
    methodology: {
      version: JUDGE_ANALYSIS_METHODOLOGY_VERSION,
      scoreOrder: [...AIR_BENCH_SCORE_ORDER],
      confusionMatrixOrientation: "human-rows-judge-columns",
      weightedKappa: "linear-distance-0-1-2",
    },
    comparisons: rows.map((row) => ({
      ...row,
      exactAgreement: row.human === row.judge,
      absoluteError: Math.abs(row.human - row.judge),
      directionalDifference: row.judge - row.human,
    })),
    metrics: calculateReliabilityMetrics(rows),
    confusionMatrix: confusionMatrix(rows),
    ...(options.integrity ? { integrity: options.integrity } : {}),
  };
}

export async function analyzeFinalizedArtifacts(finalizationValue: unknown, analysisValue: unknown): Promise<SupportedAnalysisReport> {
  const finalization = parseHumanValidationFinalization(finalizationValue);
  const analysis = parseJudgeAnalysis(analysisValue);
  if (!await verifyHumanValidationFinalizationHash(finalization)) throw new SupportedAnalysisInputError("Human-finalization hash verification failed.");
  if (!await verifyJudgeAnalysis(analysis)) throw new SupportedAnalysisInputError("Judge-analysis hash verification failed.");
  if (analysis.projectId !== finalization.projectId || analysis.finalizationId !== finalization.id || analysis.finalizationHash !== finalization.snapshotHash) {
    throw new SupportedAnalysisInputError("Judge analysis is not linked to the supplied human finalization.");
  }
  const humanRecords = finalization.annotations.map((annotation) => {
    const labelScore = validatedScore(annotation.labelId, "human", annotation.itemId);
    if (annotation.numericValue === undefined) return { itemId: annotation.itemId, score: labelScore };
    const numericScore = validatedScore(annotation.numericValue, "human", annotation.itemId);
    if (numericScore !== labelScore) {
      throw new SupportedAnalysisInputError(`Human annotation for item ${annotation.itemId} has conflicting label and numeric scores.`);
    }
    return { itemId: annotation.itemId, score: numericScore };
  });
  const judgeRecords = analysis.judgeArtifacts.map((artifact) => {
    if (artifact.judgeId !== analysis.judgeId) throw new SupportedAnalysisInputError(`Judge artifact ${artifact.id} does not belong to judge ${analysis.judgeId}.`);
    return { itemId: artifact.itemId, score: artifact.score };
  });
  return analyzeScoreRecords(humanRecords, judgeRecords, {
    source: "verified-finalized-artifacts",
    integrity: {
      humanFinalizationId: finalization.id,
      humanFinalizationHash: finalization.snapshotHash,
      judgeAnalysisId: analysis.id,
      judgeAnalysisHash: analysis.analysisHash,
      judgeArtifactSetHash: analysis.judgeArtifactSetHash,
      verified: true,
    },
  });
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

export function supportedAnalysisReportJson(report: SupportedAnalysisReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function supportedAnalysisReportCsv(report: SupportedAnalysisReport): string {
  const reportColumns = [
    "report_schema_version", "source", "methodology_version", "integrity_verified",
    "human_finalization_id", "human_finalization_hash", "judge_analysis_id", "judge_analysis_hash",
    "judge_artifact_set_hash",
  ];
  const metricColumns = [
    "n", "exact_agreement_count", "exact_agreement_rate", "cohen_kappa", "linear_weighted_kappa",
    "mean_absolute_error", "directional_bias", "severe_disagreement_count", "severe_disagreement_rate",
    "human_0_judge_1_count", "human_1_judge_0_count",
  ];
  const headers = [
    "item_id", "human_score", "judge_score", "exact_agreement", "absolute_error", "directional_difference",
    ...reportColumns, ...metricColumns,
  ];
  const reportValues = [
    report.schemaVersion, report.source, report.methodology.version, report.integrity?.verified ?? "",
    report.integrity?.humanFinalizationId ?? "", report.integrity?.humanFinalizationHash ?? "",
    report.integrity?.judgeAnalysisId ?? "", report.integrity?.judgeAnalysisHash ?? "",
    report.integrity?.judgeArtifactSetHash ?? "",
  ];
  const metricValues = [
    report.metrics.n, report.metrics.exactAgreementCount, report.metrics.exactAgreementRate, report.metrics.cohenKappa,
    report.metrics.linearWeightedKappa, report.metrics.meanAbsoluteError, report.metrics.directionalBias,
    report.metrics.severeDisagreementCount, report.metrics.severeDisagreementRate, report.metrics.human0Judge1Count,
    report.metrics.human1Judge0Count,
  ];
  const rows = report.comparisons.map((comparison) => [
    comparison.itemId, comparison.human, comparison.judge, comparison.exactAgreement,
    comparison.absoluteError, comparison.directionalDifference, ...reportValues, ...metricValues,
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
