import { describe, expect, it } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation } from "../core/types";
import { buildLocalImportBundle } from "../import/buildBundle";
import type { ImportPreflight } from "../import/types";
import { findResumeItemId } from "../projects/progress";
import { openSafeFlowDatabase } from "../storage/database";
import { createAnnotatedCsv } from "./annotatedCsv";
import {
  createSafeFlowProjectBackup,
  parseSafeFlowProjectBackupText,
  restoreSafeFlowProjectBackup,
  SafeFlowBackupValidationError,
  serializeSafeFlowProjectBackup,
} from "./projectBackup";

function createBundle() {
  const pack = loadBundledBenchmarkPack("air-bench-2024");
  const rows = Array.from({ length: 10 }, (_, index) => ({
    sourceRow: index + 1,
    externalId: `fixture-${index + 1}`,
    prompt: index === 3 ? "Prompt with, comma" : `Prompt ${index + 1}`,
    response: index === 3 ? "First line\nUnicode 🙂 evidence\nLast line" : `Response ${index + 1}`,
    categoryId: index === 3 ? "14.3940.4" : "1.1.1",
    metadata: { sourceProvenance: "synthetic-test-fixture" },
    fieldProvenance: { prompt: "uploaded-source" as const, categoryId: "uploaded-source" as const, taxonomy: "safeflow-derived-mapping" as const },
    judge: { score: 999, reasoning: `ISOLATED_JUDGE_REASON_${index + 1}` },
    referenceLabel: `ISOLATED_REFERENCE_${index + 1}`,
  }));
  const preflight: ImportPreflight = {
    ready: true, rows, issues: [],
    summary: { sourceRows: 10, validRows: 10, errors: 0, warnings: 0, categorizedRows: 10, judgeArtifacts: 10, referenceArtifacts: 10 },
  };
  let id = 0;
  return { pack, bundle: buildLocalImportBundle(preflight, {
    projectName: "Portable validation", benchmarkPackId: pack.id, benchmarkPackVersion: pack.version,
    sourceName: "portable.csv", sourceSha256: "a".repeat(64), format: "csv", mapping: { prompt: "prompt", response: "response" },
    now: "2026-08-14T10:00:00.000Z", createId: () => `portable-${id++}`,
  }) };
}

function annotation(itemId: string, projectId: string, status: "draft" | "submitted", revision: number): Annotation {
  return {
    id: `${itemId}:local-validator`, itemId, projectId, validatorId: "local-validator", benchmarkPackId: "air-bench-2024",
    status, answers: { score: 0.5, confidence: "Medium", reasoning: "Human reasoning only", "needs-review": status === "draft" },
    evidenceSpans: [], revision, createdAt: "2026-08-14T10:05:00.000Z", updatedAt: `2026-08-14T10:05:0${revision}.000Z`,
    ...(status === "submitted" ? { submittedAt: "2026-08-14T10:05:00.000Z" } : {}),
  };
}

describe("SafeFlow project backup", () => {
  it("round-trips annotate → export → delete → restore → resume exactly", async () => {
    const { pack, bundle } = createBundle();
    const database = await openSafeFlowDatabase(indexedDB, `backup-${crypto.randomUUID()}`);
    await database.putBenchmarkPack(pack);
    await database.importProjectBundle(bundle);
    for (const item of bundle.items.slice(0, 3)) await database.saveAnnotation(annotation(item.id, bundle.project.id, "submitted", 1));
    const draft = annotation(bundle.items[3].id, bundle.project.id, "draft", 2);
    draft.evidenceSpans = [{ start: 11, end: 30, text: "Unicode 🙂 evidence" }];
    await database.saveAnnotation(draft);

    const exportedAt = "2026-08-14T11:00:00.000Z";
    const original = await createSafeFlowProjectBackup(database, bundle.project.id, exportedAt);
    const serialized = serializeSafeFlowProjectBackup(original);
    expect(original.workflow.progress).toMatchObject({ total: 10, submitted: 3, drafts: 1, percentComplete: 30 });
    expect(original.workflow.source.sha256).toBe("a".repeat(64));
    expect(original.workflow.benchmark).toMatchObject({ packId: pack.id, packVersion: pack.version, rubricVersion: pack.version });
    expect(JSON.stringify(original.workflow)).not.toContain("ISOLATED_JUDGE_REASON");
    expect(original.isolatedArtifacts.judgeArtifacts).toHaveLength(10);

    await database.deleteProject(bundle.project.id);
    expect(await database.getProjectDetail(bundle.project.id)).toBeUndefined();
    const restoredId = await restoreSafeFlowProjectBackup(database, parseSafeFlowProjectBackupText(serialized));
    expect(restoredId).toBe(bundle.project.id);

    const [detail, items, annotations] = await Promise.all([
      database.getProjectDetail(restoredId), database.getBlindedProjectItems(restoredId), database.getProjectAnnotations(restoredId),
    ]);
    expect(detail?.progress).toEqual(original.workflow.progress);
    expect(findResumeItemId(items, annotations)).toBe(bundle.items[3].id);
    expect(annotations.find((candidate) => candidate.itemId === bundle.items[3].id)?.evidenceSpans).toEqual(draft.evidenceSpans);
    expect(JSON.stringify(items)).not.toMatch(/ISOLATED_JUDGE_REASON|ISOLATED_REFERENCE/);

    const reexported = await createSafeFlowProjectBackup(database, restoredId, exportedAt);
    expect(reexported).toEqual(original);
    await expect(restoreSafeFlowProjectBackup(database, original)).rejects.toThrow(/already exists/);
    database.close();
  });

  it("rejects evidence offsets that no longer match response text", () => {
    const invalid = {
      schemaVersion: "1.0", kind: "safeflow-project-backup", exportedAt: "now",
      provenance: { application: "SafeFlow Human Validator", storageMode: "persistent-local", source: "local-browser-project-export" },
      workflow: {
        project: { id: "p", name: "p", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "x", status: "VALIDATING", createdAt: "now", updatedAt: "now" },
        source: { fileName: "x.csv", importRuns: [] },
        benchmark: { packId: "air-bench-2024", packVersion: "x", rubricVersion: "x", pack: loadBundledBenchmarkPack("air-bench-2024") },
        progress: { total: 1, unseen: 0, drafts: 1, submitted: 0, flagged: 0, lowConfidence: 0, skipped: 0, percentComplete: 0 },
        items: [{ id: "i", projectId: "p", prompt: "p", response: "hello", metadata: {}, createdAt: "now" }],
        annotations: [{ id: "a", itemId: "i", projectId: "p", validatorId: "local-validator", benchmarkPackId: "air-bench-2024", status: "draft", answers: {}, evidenceSpans: [{ start: 0, end: 2, text: "xx" }], revision: 1, createdAt: "now", updatedAt: "now" }],
      },
      isolatedArtifacts: { judgeArtifacts: [], referenceArtifacts: [] },
    };
    invalid.workflow.benchmark.packVersion = invalid.workflow.benchmark.pack.version;
    invalid.workflow.benchmark.rubricVersion = invalid.workflow.benchmark.pack.version;
    invalid.workflow.project.benchmarkPackVersion = invalid.workflow.benchmark.pack.version;
    expect(() => parseSafeFlowProjectBackupText(JSON.stringify(invalid))).toThrow(SafeFlowBackupValidationError);
    expect(() => parseSafeFlowProjectBackupText(JSON.stringify(invalid))).toThrow(/invalid evidence span/);
  });

  it("creates a human-only, multiline-safe annotated CSV", () => {
    const { bundle } = createBundle();
    const human = annotation(bundle.items[3].id, bundle.project.id, "draft", 2);
    human.evidenceSpans = [{ start: 11, end: 30, text: "Unicode 🙂 evidence" }];
    const blinded = bundle.items.map(({ id, projectId, externalId, prompt, response, categoryId }) => ({ id, projectId, externalId, prompt, response, categoryId }));
    const csv = createAnnotatedCsv(blinded, [human]);
    expect(csv).toContain('"human_score"');
    expect(csv).toContain('"Unicode 🙂 evidence"');
    expect(csv).toContain('"First line\nUnicode 🙂 evidence\nLast line"');
    expect(csv).not.toMatch(/judge|ISOLATED_JUDGE_REASON|ISOLATED_REFERENCE/i);
  });
});
