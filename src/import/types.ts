import type { AnnotationValue } from "../core/types";

export type DatasetFormat = "csv" | "json" | "jsonl";
export type ImportField =
  | "prompt"
  | "response"
  | "externalId"
  | "categoryId"
  | "judgeScore"
  | "judgeReasoning"
  | "referenceLabel";

export type DatasetRow = Record<string, unknown>;
export type DatasetMapping = Partial<Record<ImportField, string>>;

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
  prompt: string;
  response: string;
  categoryId?: string;
  metadata: Record<string, unknown>;
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
