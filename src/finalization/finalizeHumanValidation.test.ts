import { describe, expect, it } from "vitest";
import type { Annotation } from "../core/types";
import { openSafeFlowDatabase, type SafeFlowDatabase } from "../storage/database";
import { finalizeHumanValidation, prepareHumanValidationFinalization } from "./finalizeHumanValidation";
import { finalizationHashPayload, hashFinalizationPayload } from "./hashFinalization";
import { finalizationSource } from "./testFixtures";

async function seed(database: SafeFlowDatabase, count = 3) {
  const source = finalizationSource(count);
  await database.putBenchmarkPack(source.benchmarkPack);
  await database.putProject(source.project);
  for (const item of source.items) await database.putValidationItem(item);
  for (const annotation of source.annotations) await database.putAnnotation(annotation);
  for (const run of source.importRuns) await database.putImportRun(run);
  return source;
}

function fixedIds() {
  const values = ["human-finalization-1", "audit-event-1"];
  return () => values.shift()!;
}

describe("immutable human validation finalization", () => {
  it("finalizes a complete 20-item human-validation workflow", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-twenty-${crypto.randomUUID()}`);
    const source = await seed(database, 20);
    const finalization = await finalizeHumanValidation(database, source.project.id, {
      acknowledgeWarnings: true, createId: fixedIds(),
    });
    expect(finalization.projectSnapshot).toMatchObject({ totalItems: 20, submittedAnnotations: 20 });
    expect(finalization.annotations).toHaveLength(20);
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("HUMAN_FINALIZED");
    database.close();
  });

  it("creates a complete, deterministic, human-only snapshot without judge artifacts", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, {
      acknowledgeWarnings: true, now: "2026-08-14T22:14:37.813Z", createId: fixedIds(),
    });
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("HUMAN_FINALIZED");
    expect(finalization).toMatchObject({ id: "human-finalization-1", status: "FINALIZED", finalizationSequence: 1, projectSnapshot: { submittedAnnotations: 3, flaggedAnnotations: 1, lowConfidenceAnnotations: 1 } });
    expect(finalization.annotations.map((annotation) => annotation.sourceRowIndex)).toEqual([1, 2, 3]);
    expect(finalization.annotations[0]).toMatchObject({
      labelId: "0", confidence: "high", reasoning: "Human reason 1", annotationRevision: 1,
      benchmarkPackVersion: source.benchmarkPack.version, rubricVersion: source.benchmarkPack.version,
      evidenceSpans: [{ source: "response", startOffset: 0, endOffset: 10, quotedText: "Unicode 🙂" }],
    });
    expect(finalization.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(finalization)).not.toMatch(/judge_score|judge_reason|reference_label|expected answer/i);
    const archive = await database.getProjectArchive(source.project.id);
    expect(archive?.auditEvents).toHaveLength(1);
    expect(JSON.stringify(archive?.auditEvents[0])).not.toContain("Prompt 1");
    expect("updateHumanValidationFinalization" in database).toBe(false);
    database.close();
  });

  it("succeeds with an empty judge-artifact store and locks normal annotation saving", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-no-judge-${crypto.randomUUID()}`);
    const source = await seed(database);
    await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: fixedIds() });
    const changed: Annotation = { ...source.annotations[0], revision: source.annotations[0].revision + 1, answers: { ...source.annotations[0].answers, score: 1 }, updatedAt: "2026-08-14T23:00:00.000Z" };
    await expect(database.saveAnnotation(changed)).rejects.toThrow(/annotations are locked/i);
    database.close();
  });

  it("keeps the finalized snapshot unchanged if an editable annotation is mutated directly afterward", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-immutable-${crypto.randomUUID()}`);
    const source = await seed(database);
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: fixedIds() });
    await database.putAnnotation({ ...source.annotations[0], revision: 99, answers: { ...source.annotations[0].answers, score: 1 }, updatedAt: "later" });
    expect(await database.getHumanValidationFinalization(finalization.id)).toEqual(finalization);
    database.close();
  });

  it("aborts a stale prepared finalization and creates no partial record", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-stale-${crypto.randomUUID()}`);
    const source = await seed(database);
    const prepared = await prepareHumanValidationFinalization(database, source.project.id, { createId: fixedIds() });
    const latest = source.annotations[1];
    await database.saveAnnotation({ ...latest, revision: latest.revision + 1, answers: { ...latest.answers, reasoning: "Changed before commit" }, updatedAt: "2026-08-14T23:01:00.000Z" });
    await expect(database.commitHumanValidationFinalization(prepared)).rejects.toThrow(/changed while finalization was being prepared/i);
    expect(await database.listHumanValidationFinalizations(source.project.id)).toEqual([]);
    expect((await database.getProjectDetail(source.project.id))?.project.status).toBe("HUMAN_COMPLETE");
    database.close();
  });

  it("rejects double finalization without changing the existing snapshot", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-double-${crypto.randomUUID()}`);
    const source = await seed(database);
    const first = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: fixedIds() });
    await expect(finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: fixedIds() })).rejects.toThrow(/already been finalized/i);
    expect(await database.listHumanValidationFinalizations(source.project.id)).toEqual([first]);
    database.close();
  });

  it("produces stable hashes and changes them for score, evidence, or rubric changes", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `finalize-hash-${crypto.randomUUID()}`);
    const source = await seed(database);
    const options = { now: "2026-08-14T22:14:37.813Z", createId: fixedIds() };
    const first = await prepareHumanValidationFinalization(database, source.project.id, options);
    const second = await prepareHumanValidationFinalization(database, source.project.id, { now: options.now, createId: fixedIds() });
    expect(second.finalization.snapshotHash).toBe(first.finalization.snapshotHash);
    const base = finalizationHashPayload(first.finalization);
    const scoreChanged = structuredClone(base); scoreChanged.annotations[0].labelId = "1"; scoreChanged.annotations[0].numericValue = 1;
    const evidenceChanged = structuredClone(base); evidenceChanged.annotations[0].evidenceSpans[0].quotedText = "Changed evidence";
    const rubricChanged = structuredClone(base); rubricChanged.benchmark.rubricVersion = "different-rubric";
    await expect(hashFinalizationPayload(scoreChanged)).resolves.not.toBe(first.finalization.snapshotHash);
    await expect(hashFinalizationPayload(evidenceChanged)).resolves.not.toBe(first.finalization.snapshotHash);
    await expect(hashFinalizationPayload(rubricChanged)).resolves.not.toBe(first.finalization.snapshotHash);
    database.close();
  });
});
