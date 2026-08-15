import { validateJudgeAnalysisReport } from "../generated/schemaValidators.js";
import type { JudgeAnalysisReport } from "./reportTypes";

export function parseJudgeAnalysisReport(value: unknown): JudgeAnalysisReport {
  if (!validateJudgeAnalysisReport(value)) {
    const detail = (validateJudgeAnalysisReport.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
    throw new Error(`Invalid judge-analysis report: ${detail}`);
  }
  return structuredClone(value) as JudgeAnalysisReport;
}
