import type { EvidenceSpan, IsoTimestamp, ProvenancedText } from "../core/types";

export type TrainingLabel = "0" | "0.5" | "1";
export type TrainingConfidence = "High" | "Medium" | "Low";
export type TrainingDifficulty = "introductory" | "intermediate" | "advanced";
export type TrainingReviewStatus = "draft" | "reviewed" | "approved";

export interface TrainingOptionFeedback {
  isCorrect: boolean;
  explanation: string;
}

export interface TrainingContentProvenance {
  kind: "safeflow-authored" | "safeflow-reviewed" | "official-air-bench-dataset" | "safeflow-derived";
  label: string;
  citation?: string;
  note?: string;
}

export interface TrainingItem {
  id: string;
  moduleId: string;
  benchmarkId: string;
  benchmarkVersion: string;
  categoryId: string;
  prompt: string;
  response: string;
  correctLabel: TrainingLabel;
  correctExplanation: string;
  decisiveEvidence: EvidenceSpan[];
  optionFeedback: Record<TrainingLabel, TrainingOptionFeedback>;
  learningObjectives: string[];
  traps: string[];
  mistakeTags: string[];
  difficulty: TrainingDifficulty;
  reviewStatus: TrainingReviewStatus;
  trainingItemVersion: string;
  explanationVersion: string;
  rubricVersion: string;
  benchmarkPackVersion: string;
  applicableRule: ProvenancedText;
  provenance: {
    prompt: TrainingContentProvenance;
    response: TrainingContentProvenance;
    goldLabel: TrainingContentProvenance;
    explanation: TrainingContentProvenance;
    rubric: TrainingContentProvenance;
    category: TrainingContentProvenance;
  };
  sourcePromptId?: string;
}

export interface TrainingCurriculum {
  schemaVersion: "1.0";
  id: string;
  version: string;
  benchmarkId: string;
  benchmarkVersion: string;
  benchmarkPackVersion: string;
  title: string;
  reviewStatus: TrainingReviewStatus;
  modules: Array<{ id: string; title: string; description: string; order: number }>;
  items: TrainingItem[];
}

export interface TrainingSession {
  id: string;
  benchmarkId: string;
  benchmarkVersion: string;
  curriculumId: string;
  curriculumVersion: string;
  kind: "starter" | "retry" | "category";
  categoryId?: string;
  itemIds: string[];
  currentItemIndex: number;
  referenceOpenedItemIds: string[];
  reviewItemIds: string[];
  status: "in-progress" | "completed";
  currentItemStartedAt: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
}

export interface TrainingAttempt {
  id: string;
  sessionId: string;
  itemId: string;
  benchmarkId: string;
  selectedLabel: TrainingLabel;
  confidence: TrainingConfidence;
  correct: boolean;
  referenceOpened: boolean;
  attemptNumber: number;
  durationMs?: number;
  trainingItemVersion: string;
  explanationVersion: string;
  rubricVersion: string;
  benchmarkPackVersion: string;
  completedAt: IsoTimestamp;
}

export interface TrainingProgressSummary {
  itemsAttempted: number;
  itemsCorrect: number;
  firstAttemptAccuracy: number;
  severeErrors: number;
  averageConfidence: number;
  confidenceCalibration: Record<TrainingConfidence, { attempts: number; correct: number; accuracy: number }>;
  categoriesPracticed: string[];
  strongAreas: string[];
  needsPractice: string[];
  mistakePatterns: Array<{ tag: string; message: string; count: number }>;
}
