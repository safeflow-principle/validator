import { describe, expect, it } from "vitest";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import { finalizationSource, mockJudgeArtifacts } from "../finalization/testFixtures";
import { openSafeFlowDatabase } from "../storage/database";
import { createJudgeAnalysis } from "./createJudgeAnalysis";
import { getOrCreateJudgeAnalysisReport, prepareJudgeAnalysisReport } from "./createJudgeAnalysisReport";
import { verifyJudgeAnalysisReport } from "./hashJudgeAnalysisReport";

function ids(...values: string[]) { return () => values.shift()!; }

describe("immutable judge analysis reports", () => {
  it("persists a deterministic methodology-versioned report with human rows and judge columns", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `report-${crypto.randomUUID()}`);
    const source = finalizationSource(20);
    await database.putBenchmarkPack(source.benchmarkPack); await database.putProject(source.project);
    for (const item of source.items) await database.putValidationItem(item);
    for (const annotation of source.annotations) await database.putAnnotation(annotation);
    for (const run of source.importRuns) await database.putImportRun(run);
    for (const artifact of mockJudgeArtifacts(source)) await database.putJudgeArtifact(artifact);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf", "hf-audit") });
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, createId: ids("ja", "ja-audit") });
    const prepared = await prepareJudgeAnalysisReport(database, analysis.id, { now: "2026-08-14T23:30:00.000Z", createId: ids("report", "report-audit") });
    await database.commitJudgeAnalysisReport(prepared);
    const report = await database.getJudgeAnalysisReport(prepared.report.id);
    expect(report).toEqual(prepared.report);
    expect(report?.confusionMatrix).toMatchObject({ rowDimension: "human", columnDimension: "automated-judge", labels: [0, 0.5, 1] });
    expect(report?.confusionMatrix.cells).toHaveLength(9);
    expect(report?.methodology).toMatchObject({ version: "1.0.0", weightedKappa: "linear-distance-0-1-2", directionalBiasFormula: "mean(judge_score - human_score)", categoryKappaMinimumNAuthority: "safeflow-reporting-rule" });
    expect(report?.categoryBreakdowns.some((row) => row.level === "level1")).toBe(true);
    expect(report?.categoryBreakdowns.some((row) => row.level === "level4")).toBe(true);
    await expect(verifyJudgeAnalysisReport(report!)).resolves.toBe(true);
    expect(await getOrCreateJudgeAnalysisReport(database, analysis.id)).toEqual(report);
    expect("updateJudgeAnalysisReport" in database).toBe(false);
    database.close();
  });
});
