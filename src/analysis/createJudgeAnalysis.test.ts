import { describe, expect, it } from "vitest";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import { finalizationSource, mockJudgeArtifacts } from "../finalization/testFixtures";
import { openSafeFlowDatabase, type SafeFlowDatabase } from "../storage/database";
import { createJudgeAnalysis, prepareJudgeAnalysis } from "./createJudgeAnalysis";
import { verifyJudgeAnalysis } from "./hashJudgeAnalysis";

async function seed(database: SafeFlowDatabase, count = 3) {
  const source = finalizationSource(count);
  await database.putBenchmarkPack(source.benchmarkPack);
  await database.putProject(source.project);
  for (const item of source.items) await database.putValidationItem(item);
  for (const annotation of source.annotations) await database.putAnnotation(annotation);
  for (const run of source.importRuns) await database.putImportRun(run);
  for (const artifact of mockJudgeArtifacts(source)) await database.putJudgeArtifact(artifact);
  return source;
}

function ids(...values: string[]) { return () => values.shift()!; }

describe("explicit immutable judge analysis", () => {
  it("requires confirmation and atomically transitions a specific finalization to UNBLINDED", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `analysis-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf-1", "audit-hf") });
    await expect(createJudgeAnalysis(database, finalization.id, { confirmed: false })).rejects.toThrow(/explicit confirmation/i);
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("HUMAN_FINALIZED");
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, now: "2026-08-14T23:00:00.000Z", createId: ids("ja-1", "audit-ja") });
    expect(analysis).toMatchObject({ id: "ja-1", finalizationId: "hf-1", finalizationHash: finalization.snapshotHash, judgeId: "mock-automated-judge", summary: { totalItems: 3 } });
    expect(analysis.judgeArtifactSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analysis.analysisHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyJudgeAnalysis(analysis)).resolves.toBe(true);
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("UNBLINDED");
    expect(await database.getHumanValidationFinalization(finalization.id)).toEqual(finalization);
    await expect(createJudgeAnalysis(database, finalization.id, { confirmed: true })).rejects.toThrow(/already been unblinded/i);
    expect(await database.listJudgeAnalyses(source.project.id)).toEqual([analysis]);
    await expect(database.saveAnnotation({ ...source.annotations[0], revision: 99, updatedAt: "later" })).rejects.toThrow(/locked/i);
    database.close();
  });

  it("snapshots exact judge artifacts so later source mutation cannot rewrite the run", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `analysis-immutable-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf-1", "audit-hf") });
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, createId: ids("ja-1", "audit-ja") });
    const original = structuredClone(analysis);
    await database.putJudgeArtifact({ ...mockJudgeArtifacts(source)[0], score: 0.5, reasoning: "Mutated after analysis" });
    expect(await database.getJudgeAnalysis(analysis.id)).toEqual(original);
    database.close();
  });

  it("aborts a stale analysis without changing project state", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `analysis-stale-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf-1", "audit-hf") });
    const prepared = await prepareJudgeAnalysis(database, finalization.id, { createId: ids("ja-1", "audit-ja") });
    await database.putJudgeArtifact({ ...mockJudgeArtifacts(source)[0], score: 0.5 });
    await expect(database.commitJudgeAnalysis(prepared)).rejects.toThrow(/judge artifacts changed/i);
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("HUMAN_FINALIZED");
    expect(await database.listJudgeAnalyses(source.project.id)).toEqual([]);
    database.close();
  });

  it("completes the 20-row synthetic finalization-to-analysis E2E path", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `analysis-e2e-${crypto.randomUUID()}`);
    const source = await seed(database, 20);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: ids("hf-20", "audit-hf-20") });
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, createId: ids("ja-20", "audit-ja-20") });
    expect(analysis.comparisons).toHaveLength(20);
    expect(analysis.judgeArtifacts).toHaveLength(20);
    expect(analysis.summary.exactAgreements + analysis.summary.disagreements).toBe(20);
    expect(await database.getJudgeAnalysisForFinalization(finalization.id)).toEqual(analysis);
    database.close();
  });
});
