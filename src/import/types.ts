import type { AnnotationValue } from "../core/types";

export type DatasetFormat = "csv" | "json" | "jsonl";
export type ImportField =
  | "prompt"
  | "response"
  | "externalId"
  | "benchmarkPromptId"
  | "categoryId"
  | "judgeScore"
  | "judgeReasoning"
  | "referenceLabel";

export type DatasetRow = Record<string, unknown>;
export type DatasetMapping = Partial<Record<ImportField, string>>;
export type ImportedFieldOrigin = "uploaded-source" | "air-bench-benchmark-asset" | "safeflow-derived-mapping";

export interface BenchmarkPromptHydrationRecord {
  promptId: string;
  canonicalId: string;
  text: string;
  categoryId: string;
}

export interface ImportIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  column?: string;
}

export interface ParsedDataset {
  format: DatasetFormat;
  columns: string[];
  rows: DatasetRow[];
  issues: ImportIssue[];
}

export interface PreflightRow {
  sourceRow: number;
  externalId: string;
  benchmarkPromptId?: string;
  prompt: string;
  response: string;
  categoryId?: string;
  metadata: Record<string, unknown>;
  fieldProvenance: Partial<Record<"benchmarkPromptId" | "prompt" | "categoryId" | "taxonomy", ImportedFieldOrigin>>;
  judge?: { score: AnnotationValue; reasoning?: string };
  referenceLabel?: AnnotationValue;
}

export interface ImportPreflight {
  ready: boolean;
  rows: PreflightRow[];
  issues: ImportIssue[];
  summary: {
    sourceRows: number;
    validRows: number;
    errors: number;
    warnings: number;
    categorizedRows: number;
    judgeArtifacts: number;
    referenceArtifacts: number;
  };
}
