import rawStarterCurriculum from "../../benchmark-packs/air-bench-2024/training/starter.json";
import { createEvidenceSpan } from "../annotation/evidence";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { validateTrainingCurriculum } from "../generated/schemaValidators.js";
import type { TrainingCurriculum, TrainingItem, TrainingLabel } from "./types";

type RawTrainingItem = Omit<TrainingItem, "decisiveEvidence"> & { decisiveEvidenceText: string[] };
type RawTrainingCurriculum = Omit<TrainingCurriculum, "items"> & { items: RawTrainingItem[] };

export class TrainingCurriculumValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid training curriculum: ${details.join("; ")}`);
    this.name = "TrainingCurriculumValidationError";
  }
}

const labels: TrainingLabel[] = ["0", "0.5", "1"];

export function parseTrainingCurriculum(value: unknown): TrainingCurriculum {
  if (!validateTrainingCurriculum(value)) {
    throw new TrainingCurriculumValidationError(
      (validateTrainingCurriculum.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  const raw = structuredClone(value) as unknown as RawTrainingCurriculum;
  const errors: string[] = [];
  const pack = loadBundledBenchmarkPack(raw.benchmarkId);
  const categoryIds = new Set(pack.categories.map((category) => category.id));
  const moduleIds = new Set(raw.modules.map((module) => module.id));
  if (raw.reviewStatus !== "approved") errors.push("Only an approved curriculum can be loaded into scored practice.");
  if (raw.benchmarkPackVersion !== pack.version) errors.push("Curriculum benchmark-pack version does not match the bundled pack.");
  if (new Set(raw.items.map((item) => item.id)).size !== raw.items.length) errors.push("Training item IDs must be unique.");
  const items = raw.items.map(({ decisiveEvidenceText, ...item }): TrainingItem => {
    if (item.reviewStatus !== "approved") errors.push(`Training item ${item.id} is not approved.`);
    if (!moduleIds.has(item.moduleId)) errors.push(`Training item ${item.id} references an unknown module.`);
    if (!categoryIds.has(item.categoryId)) errors.push(`Training item ${item.id} references unknown category ${item.categoryId}.`);
    if (item.benchmarkPackVersion !== raw.benchmarkPackVersion) errors.push(`Training item ${item.id} has a mismatched benchmark-pack version.`);
    for (const label of labels) {
      if (item.optionFeedback[label].isCorrect !== (label === item.correctLabel)) errors.push(`Training item ${item.id} has inconsistent feedback for ${label}.`);
    }
    const decisiveEvidence = decisiveEvidenceText.flatMap((text) => {
      const start = item.response.indexOf(text);
      if (start < 0 || item.response.indexOf(text, start + 1) >= 0) {
        errors.push(`Training item ${item.id} decisive evidence must occur exactly once in the response.`);
        return [];
      }
      return [createEvidenceSpan(item.response, start, start + text.length)];
    });
    return { ...item, decisiveEvidence };
  });
  if (errors.length) throw new TrainingCurriculumValidationError(errors);
  return { ...raw, items };
}

export const airBenchStarterCurriculum = parseTrainingCurriculum(rawStarterCurriculum);

export function approvedTrainingItem(id: string): TrainingItem | undefined {
  return airBenchStarterCurriculum.items.find((item) => item.id === id && item.reviewStatus === "approved");
}
