export type EntityId = string;
export type IsoTimestamp = string;
export type ProjectStatus = "READY" | "VALIDATING" | "REVIEW" | "HUMAN_COMPLETE";

export interface Project {
  id: EntityId;
  name: string;
  benchmarkPackId: string;
  benchmarkPackVersion: string;
  status: ProjectStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ValidationItem {
  id: EntityId;
  projectId: EntityId;
  externalId?: string;
  prompt: string;
  response: string;
  categoryId?: string;
  metadata: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** The only item shape annotation UI is allowed to consume. */
export type BlindedValidationItem = Pick<
  ValidationItem,
  "id" | "projectId" | "externalId" | "prompt" | "response" | "categoryId"
>;

export type AnnotationValue = string | number | boolean | null;

export interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
}

export interface Annotation {
  id: EntityId;
  itemId: EntityId;
  projectId: EntityId;
  validatorId: EntityId;
  benchmarkPackId: string;
  status: "draft" | "submitted";
  answers: Record<string, AnnotationValue>;
  notes?: string;
  evidenceSpans: EvidenceSpan[];
  revision: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  submittedAt?: IsoTimestamp;
}

export interface AdjudicatedAnnotation {
  id: EntityId;
  itemId: EntityId;
  projectId: EntityId;
  sourceAnnotationIds: EntityId[];
  answers: Record<string, AnnotationValue>;
  rationale?: string;
  createdAt: IsoTimestamp;
}

/** Deliberately separate from ValidationItem and Annotation. */
export interface JudgeArtifact {
  id: EntityId;
  itemId: EntityId;
  judgeId: string;
  score: AnnotationValue;
  reasoning?: string;
  metadata: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** Reference labels are isolated for the same blinding reason as judge output. */
export interface ReferenceArtifact {
  id: EntityId;
  itemId: EntityId;
  label: AnnotationValue | Record<string, AnnotationValue>;
  provenance?: string;
  createdAt: IsoTimestamp;
}

export interface ImportRun {
  id: EntityId;
  projectId: EntityId;
  sourceName: string;
  status: "pending" | "complete" | "failed";
  itemCount: number;
  errors: string[];
  warnings?: string[];
  format?: string;
  mapping?: Record<string, string>;
  sourceSha256?: string;
  createdAt: IsoTimestamp;
}

export interface HumanValidationProgress {
  total: number;
  unseen: number;
  drafts: number;
  submitted: number;
  flagged: number;
  lowConfidence: number;
  skipped: number;
  percentComplete: number;
}

export interface ProjectSummary {
  project: Project;
  sourceName: string;
  lastActivityAt: IsoTimestamp;
  progress: HumanValidationProgress;
}

export interface ProjectDetail extends ProjectSummary {
  importRun?: ImportRun;
}

export type ProvenanceKind =
  | "official-benchmark-material"
  | "safeflow-paraphrase"
  | "safeflow-interpretation"
  | "safeflow-authored-example"
  | "unavailable";

export interface ProvenancedText {
  kind: ProvenanceKind;
  text?: string;
  citation?: string;
  note?: string;
}

export interface BenchmarkCategory {
  id: string;
  name: string;
  description?: ProvenancedText;
  rubric: ProvenancedText;
}

export interface AnnotationFieldOption {
  value: AnnotationValue;
  label: string;
  description?: string;
}

export interface AnnotationField {
  id: string;
  label: string;
  helpText?: ProvenancedText;
  type: "single-choice" | "boolean" | "number" | "text";
  required: boolean;
  options?: AnnotationFieldOption[];
  min?: number;
  max?: number;
}

export interface BenchmarkPack {
  schemaVersion: "1.0";
  id: string;
  name: string;
  version: string;
  description: ProvenancedText;
  provenance: {
    benchmark: string;
    benchmarkVersion: string;
    sourceUrl?: string;
    notes: string[];
  };
  categories: BenchmarkCategory[];
  reference?: {
    genericScoringRules: ProvenancedText[];
    categorySpecificRubricUnavailableText: string;
  };
  annotation: {
    instructions: ProvenancedText[];
    fields: AnnotationField[];
  };
}

export type BenchmarkSourceAuthority =
  | "official-air-bench-dataset"
  | "official-air-2024-paper"
  | "llm_eval_clean-derived"
  | "safeflow-derived";

export interface NormalizedTaxonomyLevel {
  id: string;
  name: string;
  authority: BenchmarkSourceAuthority;
  sourceField?: string;
}

export interface NormalizedTaxonomyAxisValue {
  id: string;
  sourceName: string;
  displayName: string;
  sourceAuthority: "official-air-bench-dataset";
  displayAuthority: "official-air-bench-dataset" | "safeflow-derived";
}

export interface NormalizedTaxonomyDimensionReference {
  nodeId: string;
  role: string;
  displayLabel: string;
  value: NormalizedTaxonomyAxisValue;
}

export type NormalizedLevel3Relationship =
  | { kind: "single"; nodeId: string }
  | { kind: "composite"; dimensions: [NormalizedTaxonomyDimensionReference, NormalizedTaxonomyDimensionReference] };

export interface NormalizedTaxonomyLeaf {
  categoryId: string;
  promptCount: number;
  level1: NormalizedTaxonomyLevel;
  level2: NormalizedTaxonomyLevel;
  /** Exact Level-3 encoding found in the source dataset, including 3940/4142. */
  sourceLevel3: NormalizedTaxonomyLevel;
  /** Reference into the separate 45-node conceptual Level-3 taxonomy. */
  conceptualLevel3: NormalizedLevel3Relationship;
  level4: NormalizedTaxonomyLevel;
}

export interface NormalizedTaxonomyAsset {
  schemaVersion: "1.1";
  benchmarkId: "air-bench-2024";
  conceptualLevel3Nodes: NormalizedTaxonomyLevel[];
  leaves: NormalizedTaxonomyLeaf[];
}

export interface NormalizedBenchmarkPrompt {
  schemaVersion: "1.0";
  id: string;
  text: string;
  contentSha256: string;
  categoryId: string;
  source: {
    benchmark: "AIR-BENCH 2024";
    dataset: "stanford-crfm/air-bench-2024";
    configuration: string;
    split: string;
    sourceRowIndex: number;
  };
  llmEvalClean: {
    promptId: string;
    dataSplit: string;
    slice: string;
    expectedBehavior: string;
  };
}
