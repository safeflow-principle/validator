import { validateJudgeAnalysis } from "../generated/schemaValidators.js";
import type { JudgeAnalysis } from "./types";

export class JudgeAnalysisSchemaError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid judge analysis: ${details.join("; ")}`);
    this.name = "JudgeAnalysisSchemaError";
  }
}

export function parseJudgeAnalysis(value: unknown): JudgeAnalysis {
  if (!validateJudgeAnalysis(value)) {
    throw new JudgeAnalysisSchemaError((validateJudgeAnalysis.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`));
  }
  return structuredClone(value) as JudgeAnalysis;
}
