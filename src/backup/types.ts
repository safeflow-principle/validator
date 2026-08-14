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

export interface ProjectArchiveRecords {
  project: Project;
  items: ValidationItem[];
  annotations: Annotation[];
  importRuns: ImportRun[];
  benchmarkPack: BenchmarkPack;
  judgeArtifacts: JudgeArtifact[];
  referenceArtifacts: ReferenceArtifact[];
}

export interface SafeFlowProjectBackup {
  schemaVersion: "1.0";
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
