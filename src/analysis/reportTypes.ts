import type { IsoTimestamp } from "../core/types";

export const JUDGE_ANALYSIS_REPORT_SCHEMA_VERSION = "1.0" as const;
export const JUDGE_ANALYSIS_METHODOLOGY_VERSION = "1.0.0" as const;
export const AIR_BENCH_SCORE_ORDER = [0, 0.5, 1] as const;
export type AirBenchScore = (typeof AIR_BENCH_SCORE_ORDER)[number];
export type TaxonomyBreakdownLevel = "level1" | "level2" | "level3" | "level4";

export interface ReliabilityMetrics {
  n: number;
  exactAgreementCount: number;
  exactAgreementRate: number;
  cohenKappa: number | null;
  linearWeightedKappa: number | null;
  meanAbsoluteError: number;
  directionalBias: number;
  severeDisagreementCount: number;
  severeDisagreementRate: number;
  human0Judge1Count: number;
  human1Judge0Count: number;
}

export interface ConfusionMatrixCell {
  humanScore: AirBenchScore;
  judgeScore: AirBenchScore;
  count: number;
  itemIds: string[];
}

export interface CategoryBreakdown {
  level: TaxonomyBreakdownLevel;
  categoryId: string;
  categoryName: string;
  itemIds: string[];
  metrics: ReliabilityMetrics;
  reliabilityNote?: string;
}

export interface JudgeAnalysisReport {
  id: string;
  schemaVersion: typeof JUDGE_ANALYSIS_REPORT_SCHEMA_VERSION;
  status: "COMPLETED";
  projectId: string;
  analysisId: string;
  analysisHash: string;
  finalizationId: string;
  finalizationHash: string;
  methodology: {
    version: typeof JUDGE_ANALYSIS_METHODOLOGY_VERSION;
    scoreOrder: [0, 0.5, 1];
    confusionMatrixOrientation: "human-rows-judge-columns";
    cohenKappa: "unweighted";
    weightedKappa: "linear-distance-0-1-2";
    meanAbsoluteErrorFormula: "mean(abs(human_score - judge_score))";
    directionalBiasFormula: "mean(judge_score - human_score)";
    categoryKappaMinimumN: 10;
    categoryKappaMinimumNAuthority: "safeflow-reporting-rule";
  };
  metrics: ReliabilityMetrics;
  confusionMatrix: {
    rowDimension: "human";
    columnDimension: "automated-judge";
    labels: [0, 0.5, 1];
    cells: ConfusionMatrixCell[];
  };
  severeDisagreements: {
    human0Judge1ItemIds: string[];
    human1Judge0ItemIds: string[];
  };
  categoryBreakdowns: CategoryBreakdown[];
  createdAt: IsoTimestamp;
  reportHash: string;
  provenance: {
    application: "SafeFlow Human Validator";
    applicationVersion: string;
    localOnly: true;
    analysisId: string;
    analysisHash: string;
    finalizationId: string;
    finalizationHash: string;
    methodologyVersion: typeof JUDGE_ANALYSIS_METHODOLOGY_VERSION;
  };
}

export interface JudgeAnalysisReportAuditEvent {
  id: string;
  type: "judge_analysis_report_created";
  projectId: string;
  finalizationId: string;
  analysisId: string;
  reportId: string;
  createdAt: IsoTimestamp;
  metadata: {
    analysisHash: string;
    finalizationHash: string;
    methodologyVersion: string;
    reportHash: string;
    itemCount: number;
  };
}

export interface PreparedJudgeAnalysisReport {
  report: JudgeAnalysisReport;
  auditEvent: JudgeAnalysisReportAuditEvent;
  expectedAnalysisState: string;
  expectedFinalizationState: string;
}
