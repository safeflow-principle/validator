import { canonicalizeFinalizationPayload } from "../finalization/canonicalize";
import type { JudgeAnalysisReport } from "./reportTypes";

export function judgeAnalysisReportPayload(report: JudgeAnalysisReport): Omit<JudgeAnalysisReport, "reportHash"> {
  const { reportHash: _reportHash, ...payload } = report;
  return payload;
}

export async function hashJudgeAnalysisReport(payload: Omit<JudgeAnalysisReport, "reportHash">): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeFinalizationPayload(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyJudgeAnalysisReport(report: JudgeAnalysisReport): Promise<boolean> {
  return await hashJudgeAnalysisReport(judgeAnalysisReportPayload(report)) === report.reportHash;
}
