import type { AnnotationValue, IsoTimestamp, JudgeArtifact, Project } from "../core/types";
import type { HumanValidationFinalization } from "../finalization/types";

export const JUDGE_ANALYSIS_SCHEMA_VERSION = "1.0" as const;

export interface JudgeArtifactSnapshot extends JudgeArtifact {
  artifactHash: string;
}

export interface JudgeItemComparison {
  itemId: string;
  externalItemId?: string;
  sourceRowIndex: number;
  humanLabelId: string;
  humanNumericValue?: number;
  judgeScore: AnnotationValue;
  exactAgreement: boolean;
  judgeArtifactId: string;
  judgeReasoning?: string;
}

export interface JudgeAnalysis {
  id: string;
  schemaVersion: typeof JUDGE_ANALYSIS_SCHEMA_VERSION;
  status: "COMPLETED";
  projectId: string;
  finalizationId: string;
  finalizationHash: string;
  judgeId: string;
  judgeArtifactSetHash: string;
  judgeArtifacts: JudgeArtifactSnapshot[];
  comparisons: JudgeItemComparison[];
  summary: {
    totalItems: number;
    exactAgreements: number;
    disagreements: number;
    exactAgreementRate: number;
  };
  createdAt: IsoTimestamp;
  analysisHash: string;
  provenance: {
    application: "SafeFlow Human Validator";
    applicationVersion: string;
    localOnly: true;
    humanFinalizationId: string;
    humanFinalizationHash: string;
    judgeArtifactSetHash: string;
  };
}

export interface JudgeAnalysisAuditEvent {
  id: string;
  type: "judge_analysis_created";
  projectId: string;
  finalizationId: string;
  analysisId: string;
  createdAt: IsoTimestamp;
  metadata: {
    finalizationHash: string;
    judgeArtifactSetHash: string;
    analysisHash: string;
    judgeId: string;
    itemCount: number;
  };
}

export interface JudgeAnalysisSourceRecords {
  project: Project;
  finalization: HumanValidationFinalization;
  judgeArtifacts: JudgeArtifact[];
}

export interface JudgeAnalysisStateToken {
  projectId: string;
  projectStatus: Project["status"];
  projectUpdatedAt: string;
  finalizationId: string;
  finalizationHash: string;
  judgeId: string;
  judgeArtifactState: string[];
}

export interface PreparedJudgeAnalysis {
  analysis: JudgeAnalysis;
  auditEvent: JudgeAnalysisAuditEvent;
  expectedState: JudgeAnalysisStateToken;
}
