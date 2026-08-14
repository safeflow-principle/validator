export type EntityId = string;
export type IsoTimestamp = string;

export interface Project {
  id: EntityId;
  name: string;
  benchmarkPackId: string;
  benchmarkPackVersion: string;
  status: "active" | "archived";
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

export interface Annotation {
  id: EntityId;
  itemId: EntityId;
  projectId: EntityId;
  validatorId: EntityId;
  benchmarkPackId: string;
  status: "draft" | "finalized";
  answers: Record<string, AnnotationValue>;
  notes?: string;
  revision: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  finalizedAt?: IsoTimestamp;
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
  createdAt: IsoTimestamp;
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
  annotation: {
    instructions: ProvenancedText[];
    fields: AnnotationField[];
  };
}
