import type { Annotation, BenchmarkPack, ImportRun, IsoTimestamp, Project, ProjectStatus, ValidationItem } from "../core/types";

export const HUMAN_FINALIZATION_SCHEMA_VERSION = "1.0" as const;

export type FinalizedConfidence = "high" | "medium" | "low";

export interface FinalizedEvidenceSpan {
  source: "response" | "prompt";
  startOffset: number;
  endOffset: number;
  quotedText: string;
}

export interface FinalizedTaxonomyPath {
  level1?: string;
  level2?: string;
  level3?: string;
  level4?: string;
}

export interface FinalizedHumanAnnotation {
  itemId: string;
  externalItemId?: string;
  promptId?: string;
  promptGroupId?: string;
  prompt: string;
  response: string;
  sourceRowIndex: number;
  categoryId?: string;
  taxonomyPath?: FinalizedTaxonomyPath;
  labelId: string;
  numericValue?: number;
  confidence: FinalizedConfidence;
  reasoning?: string;
  evidenceSpans: FinalizedEvidenceSpan[];
  needsReview: boolean;
  flagReasons?: string[];
  annotationId: string;
  annotationRevision: number;
  annotationRole: "PRIMARY";
  annotationCreatedAt: IsoTimestamp;
  annotationUpdatedAt: IsoTimestamp;
  annotationSubmittedAt: IsoTimestamp;
  benchmarkPackId: string;
  benchmarkPackVersion: string;
  rubricVersion: string;
  finalizedAt: IsoTimestamp;
}

export interface FinalizationProvenance {
  application: "SafeFlow Human Validator";
  applicationVersion: string;
  schemaVersion: typeof HUMAN_FINALIZATION_SCHEMA_VERSION;
  benchmarkId: string;
  benchmarkVersion: string;
  benchmarkPackVersion: string;
  rubricVersion: string;
  sourceFileName: string;
  sourceFileSha256: string;
  importRunId: string;
  validatorId: string;
  localOnly: true;
}

export interface HumanValidationFinalization {
  id: string;
  schemaVersion: typeof HUMAN_FINALIZATION_SCHEMA_VERSION;
  projectId: string;
  finalizationSequence: number;
  status: "FINALIZED";
  validatorId: string;
  benchmark: {
    benchmarkId: string;
    benchmarkVersion: string;
    benchmarkPackVersion: string;
    rubricVersion: string;
  };
  source: {
    fileName: string;
    fileSha256: string;
    importRunId: string;
    importTimestamp: IsoTimestamp;
  };
  projectSnapshot: {
    projectName: string;
    sourceRows: number;
    excludedItems: number;
    totalItems: number;
    includedItems: number;
    submittedAnnotations: number;
    flaggedAnnotations: number;
    lowConfidenceAnnotations: number;
    mediumConfidenceFlaggedAnnotations: number;
  };
  annotations: FinalizedHumanAnnotation[];
  finalizedAt: IsoTimestamp;
  snapshotHash: string;
  previousFinalizationId?: string;
  supersedesFinalizationId?: string;
  provenance: FinalizationProvenance;
}

export interface HumanValidationAuditEvent {
  id: string;
  type: "human_validation_finalized";
  projectId: string;
  finalizationId: string;
  finalizationSequence: number;
  createdAt: IsoTimestamp;
  metadata: {
    snapshotHash: string;
    itemCount: number;
    benchmarkId: string;
    benchmarkVersion: string;
    rubricVersion: string;
  };
}

export interface HumanFinalizationSourceRecords {
  project: Project;
  items: ValidationItem[];
  annotations: Annotation[];
  importRuns: ImportRun[];
  benchmarkPack: BenchmarkPack;
}

export interface FinalizationIssue {
  code: string;
  message: string;
  itemId?: string;
  externalItemId?: string;
  field?: string;
}

export interface FinalizationWarning {
  code: "flagged-annotations" | "low-confidence-annotations";
  message: string;
  count: number;
  itemIds: string[];
  acknowledgementRequired: true;
}

export interface FinalizationEligibility {
  eligible: boolean;
  summary: {
    sourceRows: number;
    excluded: number;
    included: number;
    ready: number;
    flagged: number;
    lowConfidence: number;
    mediumConfidenceFlagged: number;
    incomplete: number;
  };
  issues: FinalizationIssue[];
  warnings: FinalizationWarning[];
}

export interface FinalizationStateToken {
  projectId: string;
  projectStatus: ProjectStatus;
  projectUpdatedAt: string;
  benchmarkPackId: string;
  benchmarkPackVersion: string;
  itemState: string[];
  importRunState: string[];
  annotationRevisions: Array<{ id: string; itemId: string; revision: number; status: Annotation["status"]; updatedAt: string }>;
  annotationState: string[];
}

export interface PreparedHumanValidationFinalization {
  finalization: HumanValidationFinalization;
  auditEvent: HumanValidationAuditEvent;
  expectedState: FinalizationStateToken;
  eligibility: FinalizationEligibility;
}

export interface FinalizedHumanValidationReader {
  getLatestForProject(projectId: string): Promise<HumanValidationFinalization | null>;
  getById(finalizationId: string): Promise<HumanValidationFinalization | null>;
}
