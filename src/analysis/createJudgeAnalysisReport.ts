import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import { canonicalizeFinalizationPayload } from "../finalization/canonicalize";
import type { SafeFlowDatabase } from "../storage/database";
import { verifyJudgeAnalysis } from "./hashJudgeAnalysis";
import { hashJudgeAnalysisReport } from "./hashJudgeAnalysisReport";
import { calculateCategoryBreakdowns, calculateReliabilityMetrics, numericComparisons } from "./reportMetrics";
import { AIR_BENCH_SCORE_ORDER, JUDGE_ANALYSIS_METHODOLOGY_VERSION, JUDGE_ANALYSIS_REPORT_SCHEMA_VERSION, type JudgeAnalysisReport, type PreparedJudgeAnalysisReport } from "./reportTypes";

export async function prepareJudgeAnalysisReport(
  database: SafeFlowDatabase,
  analysisId: string,
  options: { now?: string; createId?: () => string; applicationVersion?: string } = {},
): Promise<PreparedJudgeAnalysisReport> {
  const analysis = await database.getJudgeAnalysis(analysisId);
  if (!analysis) throw new Error("Judge analysis not found.");
  if (!await verifyJudgeAnalysis(analysis)) throw new Error("Judge-analysis integrity verification failed.");
  const finalization = await database.getHumanValidationFinalization(analysis.finalizationId);
  if (!finalization || finalization.snapshotHash !== analysis.finalizationHash || !await verifyHumanValidationFinalizationHash(finalization)) throw new Error("Linked human-finalization integrity verification failed.");
  const rows = numericComparisons(analysis.comparisons);
  const cells = AIR_BENCH_SCORE_ORDER.flatMap((humanScore) => AIR_BENCH_SCORE_ORDER.map((judgeScore) => {
    const itemIds = rows.filter((row) => row.human === humanScore && row.judge === judgeScore).map((row) => row.itemId);
    return { humanScore, judgeScore, count: itemIds.length, itemIds };
  }));
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const reportId = createId();
  const payload: Omit<JudgeAnalysisReport, "reportHash"> = {
    id: reportId, schemaVersion: JUDGE_ANALYSIS_REPORT_SCHEMA_VERSION, status: "COMPLETED",
    projectId: analysis.projectId, analysisId: analysis.id, analysisHash: analysis.analysisHash,
    finalizationId: finalization.id, finalizationHash: finalization.snapshotHash,
    methodology: {
      version: JUDGE_ANALYSIS_METHODOLOGY_VERSION,
      scoreOrder: [...AIR_BENCH_SCORE_ORDER],
      confusionMatrixOrientation: "human-rows-judge-columns",
      cohenKappa: "unweighted",
      weightedKappa: "linear-distance-0-1-2",
      meanAbsoluteErrorFormula: "mean(abs(human_score - judge_score))",
      directionalBiasFormula: "mean(judge_score - human_score)",
      categoryKappaMinimumN: 10,
      categoryKappaMinimumNAuthority: "safeflow-reporting-rule",
    },
    metrics: calculateReliabilityMetrics(rows),
    confusionMatrix: { rowDimension: "human", columnDimension: "automated-judge", labels: [...AIR_BENCH_SCORE_ORDER], cells },
    severeDisagreements: {
      human0Judge1ItemIds: rows.filter((row) => row.human === 0 && row.judge === 1).map((row) => row.itemId),
      human1Judge0ItemIds: rows.filter((row) => row.human === 1 && row.judge === 0).map((row) => row.itemId),
    },
    categoryBreakdowns: calculateCategoryBreakdowns(analysis, finalization),
    createdAt: now,
    provenance: {
      application: "SafeFlow Human Validator", applicationVersion: options.applicationVersion ?? "0.1.0", localOnly: true,
      analysisId: analysis.id, analysisHash: analysis.analysisHash, finalizationId: finalization.id, finalizationHash: finalization.snapshotHash,
      methodologyVersion: JUDGE_ANALYSIS_METHODOLOGY_VERSION,
    },
  };
  const report: JudgeAnalysisReport = { ...payload, reportHash: await hashJudgeAnalysisReport(payload) };
  return {
    report,
    expectedAnalysisState: canonicalizeFinalizationPayload(analysis),
    expectedFinalizationState: canonicalizeFinalizationPayload(finalization),
    auditEvent: {
      id: createId(), type: "judge_analysis_report_created", projectId: analysis.projectId, finalizationId: finalization.id,
      analysisId: analysis.id, reportId, createdAt: now,
      metadata: { analysisHash: analysis.analysisHash, finalizationHash: finalization.snapshotHash, methodologyVersion: JUDGE_ANALYSIS_METHODOLOGY_VERSION, reportHash: report.reportHash, itemCount: rows.length },
    },
  };
}

export async function getOrCreateJudgeAnalysisReport(database: SafeFlowDatabase, analysisId: string): Promise<JudgeAnalysisReport> {
  const existing = await database.getJudgeAnalysisReportForAnalysis(analysisId, JUDGE_ANALYSIS_METHODOLOGY_VERSION);
  if (existing) return existing;
  const prepared = await prepareJudgeAnalysisReport(database, analysisId);
  await database.commitJudgeAnalysisReport(prepared);
  return prepared.report;
}
