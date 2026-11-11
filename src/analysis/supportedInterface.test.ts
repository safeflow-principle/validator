import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDatasetText } from "../import/parser";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import { finalizationHashPayload, hashFinalizationPayload } from "../finalization/hashFinalization";
import { finalizationSource, mockJudgeArtifacts } from "../finalization/testFixtures";
import { openSafeFlowDatabase, type SafeFlowDatabase } from "../storage/database";
import { createJudgeAnalysis } from "./createJudgeAnalysis";
import { hashJudgeAnalysis, judgeAnalysisPayload } from "./hashJudgeAnalysis";
import { analyzeFinalizedArtifacts, analyzeScoreRecords, supportedAnalysisReportCsv, supportedAnalysisReportJson } from "./supportedInterface";

function fixtureRecords(path: string, scoreField: string) {
  const parsed = parseDatasetText(path, readFileSync(path, "utf8"));
  expect(parsed.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return parsed.rows.map((row) => ({ itemId: row.external_id, score: row[scoreField] }));
}

async function seed(database: SafeFlowDatabase) {
  const source = finalizationSource(3);
  await database.putBenchmarkPack(source.benchmarkPack);
  await database.putProject(source.project);
  for (const item of source.items) await database.putValidationItem(item);
  for (const annotation of source.annotations) await database.putAnnotation(annotation);
  for (const run of source.importRuns) await database.putImportRun(run);
  for (const artifact of mockJudgeArtifacts(source)) await database.putJudgeArtifact(artifact);
  return source;
}

function ids(...values: string[]) { return () => values.shift()!; }

describe("supported analysis interface", () => {
  it("rejects missing/coerced scores, duplicate IDs, and mismatched record sets", () => {
    for (const value of [null, undefined, "", "   ", false, true, "0.0", "1.00"]) {
      expect(() => analyzeScoreRecords([{ itemId: "one", score: value }], [{ itemId: "one", score: 0 }])).toThrow(/score/i);
    }
    expect(() => analyzeScoreRecords([{ itemId: "", score: 0 }], [{ itemId: "one", score: 0 }])).toThrow(/item ID/i);
    expect(() => analyzeScoreRecords([{ itemId: "one", score: 0 }, { itemId: "one", score: 1 }], [{ itemId: "one", score: 0 }])).toThrow(/duplicate/i);
    expect(() => analyzeScoreRecords([{ itemId: "one", score: 0 }], [{ itemId: "two", score: 0 }])).toThrow(/must match exactly/i);
    expect(analyzeScoreRecords([{ itemId: "one", score: "0" }, { itemId: "two", score: "0.5" }, { itemId: "three", score: "1" }], [
      { itemId: "one", score: 0 }, { itemId: "two", score: 0.5 }, { itemId: "three", score: 1 },
    ]).metrics.exactAgreementRate).toBe(1);
  });

  it("reproduces the fixed synthetic fixture and writes rectangular JSON/CSV reports", () => {
    const report = analyzeScoreRecords(
      fixtureRecords("fixtures/airbench-like-validation-20-answer-key.csv", "human_score"),
      fixtureRecords("fixtures/airbench-like-validation-20.csv", "judge_score"),
    );
    expect(report.metrics).toMatchObject({
      n: 20, exactAgreementCount: 13, exactAgreementRate: 0.65,
      meanAbsoluteError: 0.225, directionalBias: 0.075,
      severeDisagreementCount: 2, human0Judge1Count: 1, human1Judge0Count: 1,
    });
    expect(report.metrics.cohenKappa).toBeCloseTo(0.46360153256704967, 12);
    expect(report.metrics.linearWeightedKappa).toBeCloseTo(0.5287958115183247, 12);
    expect(JSON.parse(supportedAnalysisReportJson(report)).metrics.n).toBe(20);
    const csv = supportedAnalysisReportCsv(report);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toContain('"item_id","human_score","judge_score"');
    expect(lines[0]).toContain('"report_schema_version","source","methodology_version"');
    expect(lines[1]).toContain('"1.0","score-records","1.0.0"');
    expect(lines[1]).toContain('"20","13","0.65"');
  });

  it("verifies finalized hashes and recalculates from authoritative human/judge snapshots", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `supported-analysis-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf", "audit-hf") });
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, createId: ids("ja", "audit-ja") });
    const report = await analyzeFinalizedArtifacts(finalization, analysis);
    expect(report.source).toBe("verified-finalized-artifacts");
    expect(report.integrity).toMatchObject({
      humanFinalizationId: finalization.id,
      humanFinalizationHash: finalization.snapshotHash,
      judgeAnalysisId: analysis.id,
      judgeAnalysisHash: analysis.analysisHash,
      verified: true,
    });
    const csv = supportedAnalysisReportCsv(report);
    expect(csv).toContain(`"${finalization.snapshotHash}"`);
    expect(csv).toContain(`"${analysis.analysisHash}"`);

    const tamperedFinalization = structuredClone(finalization);
    tamperedFinalization.annotations[0].labelId = "1";
    await expect(analyzeFinalizedArtifacts(tamperedFinalization, analysis)).rejects.toThrow(/finalization hash/i);

    const tamperedAnalysis = structuredClone(analysis);
    tamperedAnalysis.judgeArtifacts[0].score = 0.5;
    await expect(analyzeFinalizedArtifacts(finalization, tamperedAnalysis)).rejects.toThrow(/analysis hash/i);

    const conflictingFinalization = structuredClone(finalization);
    conflictingFinalization.annotations[0].numericValue = conflictingFinalization.annotations[0].labelId === "1" ? 0 : 1;
    conflictingFinalization.snapshotHash = await hashFinalizationPayload(finalizationHashPayload(conflictingFinalization));
    const relinkedAnalysis = structuredClone(analysis);
    relinkedAnalysis.finalizationHash = conflictingFinalization.snapshotHash;
    relinkedAnalysis.analysisHash = await hashJudgeAnalysis(judgeAnalysisPayload(relinkedAnalysis));
    await expect(analyzeFinalizedArtifacts(conflictingFinalization, relinkedAnalysis)).rejects.toThrow(/conflicting/i);
    database.close();
  });
});
