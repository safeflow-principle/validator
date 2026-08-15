import type {
  Annotation,
  BenchmarkPack,
  HumanValidationProgress,
  ImportRun,
  JudgeArtifact,
  Project,
  ReferenceArtifact,
  ValidationItem,
} from "../core/types";
import type { HumanValidationAuditEvent, HumanValidationFinalization } from "../finalization/types";
import type { JudgeAnalysis, JudgeAnalysisAuditEvent } from "../analysis/types";
import type { JudgeAnalysisReport, JudgeAnalysisReportAuditEvent } from "../analysis/reportTypes";

export type ProjectAuditEvent = HumanValidationAuditEvent | JudgeAnalysisAuditEvent | JudgeAnalysisReportAuditEvent;

export interface ProjectArchiveRecords {
  project: Project;
  items: ValidationItem[];
  annotations: Annotation[];
  importRuns: ImportRun[];
  benchmarkPack: BenchmarkPack;
  judgeArtifacts: JudgeArtifact[];
  referenceArtifacts: ReferenceArtifact[];
  humanValidationFinalizations: HumanValidationFinalization[];
  judgeAnalyses: JudgeAnalysis[];
  judgeAnalysisReports: JudgeAnalysisReport[];
  auditEvents: ProjectAuditEvent[];
}

export interface SafeFlowProjectBackup {
  schemaVersion: "1.3";
  kind: "safeflow-project-backup";
  exportedAt: string;
  provenance: {
    application: "SafeFlow Human Validator";
    storageMode: "persistent-local";
    source: "local-browser-project-export";
  };
  workflow: {
    project: Project;
    source: {
      fileName: string;
      sha256?: string;
      importRuns: ImportRun[];
    };
    benchmark: {
      packId: string;
      packVersion: string;
      rubricVersion: string;
      pack: BenchmarkPack;
    };
    progress: HumanValidationProgress;
    items: ValidationItem[];
    annotations: Annotation[];
    humanValidationFinalizations: HumanValidationFinalization[];
    judgeAnalyses: JudgeAnalysis[];
    judgeAnalysisReports: JudgeAnalysisReport[];
    auditEvents: ProjectAuditEvent[];
  };
  isolatedArtifacts: {
    judgeArtifacts: JudgeArtifact[];
    referenceArtifacts: ReferenceArtifact[];
  };
}

export interface HumanAnnotationExportRow {
  item: Pick<ValidationItem, "id" | "externalId" | "prompt" | "response" | "categoryId">;
  annotation?: Annotation;
}
