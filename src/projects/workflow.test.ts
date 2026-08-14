import { describe, expect, it } from "vitest";
import type { Annotation } from "../core/types";
import { buildLocalImportBundle } from "../import/buildBundle";
import type { ImportPreflight } from "../import/types";
import { openSafeFlowDatabase } from "../storage/database";
import { STORE_NAMES } from "../storage/schema";
import { findResumeItemId } from "./progress";

function makeBundle(count = 10) {
  const rows = Array.from({ length: count }, (_, index) => ({
    sourceRow: index + 1,
    externalId: `row-${index + 1}`,
    prompt: `prompt ${index + 1}`,
    response: index === 3 ? "Unicode 🙂 response\nwith another line" : `response ${index + 1}`,
    categoryId: index % 2 ? "14.3940.4" : "1.1.1",
    metadata: {},
    fieldProvenance: { prompt: "uploaded-source" as const, categoryId: "uploaded-source" as const, taxonomy: "safeflow-derived-mapping" as const },
    judge: { score: 999, reasoning: `hidden judge reasoning ${index + 1}` },
    referenceLabel: `hidden reference ${index + 1}`,
  }));
  const preflight: ImportPreflight = {
    ready: true,
    rows,
    issues: [],
    summary: { sourceRows: count, validRows: count, errors: 0, warnings: 0, categorizedRows: count, judgeArtifacts: count, referenceArtifacts: count },
  };
  let id = 0;
  return buildLocalImportBundle(preflight, {
    projectName: "Workflow fixture", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test",
    sourceName: "fixture.csv", sourceSha256: "f".repeat(64), format: "csv", mapping: { prompt: "prompt", response: "response" },
    now: "2026-01-01T00:00:00.000Z", createId: () => `generated-${id++}`,
  });
}

function annotation(itemId: string, projectId: string, status: "draft" | "submitted", revision = 1): Annotation {
  return {
    id: `${itemId}:local-validator`, itemId, projectId, validatorId: "local-validator", benchmarkPackId: "air-bench-2024",
    status, answers: { score: 1, confidence: "High", reasoning: "Human-only reasoning", "needs-review": false }, evidenceSpans: [],
    revision, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: `2026-01-02T00:00:0${revision}.000Z`,
    ...(status === "submitted" ? { submittedAt: "2026-01-02T00:00:00.000Z" } : {}),
  };
}

describe("persistent validation workflow", () => {
  it("Workflow A: imports 10, submits 3, reloads, and reports 3/10", async () => {
    const name = `workflow-a-${crypto.randomUUID()}`;
    const bundle = makeBundle();
    let database = await openSafeFlowDatabase(indexedDB, name);
    await database.importProjectBundle(bundle);
    for (const item of bundle.items.slice(0, 3)) await database.saveAnnotation(annotation(item.id, bundle.project.id, "submitted"));
    database.close();

    database = await openSafeFlowDatabase(indexedDB, name);
    const detail = await database.getProjectDetail(bundle.project.id);
    expect(detail?.progress).toMatchObject({ total: 10, submitted: 3, unseen: 7, percentComplete: 30 });
    expect(detail?.project.status).toBe("VALIDATING");
    database.close();
  });

  it("Workflow B: restores the existing row-4 draft on reopen", async () => {
    const name = `workflow-b-${crypto.randomUUID()}`;
    const bundle = makeBundle();
    let database = await openSafeFlowDatabase(indexedDB, name);
    await database.importProjectBundle(bundle);
    for (const item of bundle.items.slice(0, 3)) await database.saveAnnotation(annotation(item.id, bundle.project.id, "submitted"));
    const draft = annotation(bundle.items[3].id, bundle.project.id, "draft");
    draft.evidenceSpans = [{ start: 8, end: 19, text: "🙂 response" }];
    await database.saveAnnotation(draft);
    database.close();

    database = await openSafeFlowDatabase(indexedDB, name);
    const [items, annotations] = await Promise.all([database.getBlindedProjectItems(bundle.project.id), database.getProjectAnnotations(bundle.project.id)]);
    expect(findResumeItemId(items, annotations)).toBe(bundle.items[3].id);
    expect(annotations.find((candidate) => candidate.itemId === bundle.items[3].id)?.evidenceSpans).toEqual(draft.evidenceSpans);
    database.close();
  });

  it("Workflow C: restores a submitted annotation when its item is reopened", async () => {
    const name = `workflow-c-${crypto.randomUUID()}`;
    const bundle = makeBundle(1);
    let database = await openSafeFlowDatabase(indexedDB, name);
    await database.importProjectBundle(bundle);
    await database.saveAnnotation(annotation(bundle.items[0].id, bundle.project.id, "submitted", 4));
    database.close();

    database = await openSafeFlowDatabase(indexedDB, name);
    const restored = (await database.getProjectAnnotations(bundle.project.id))[0];
    expect(restored).toMatchObject({ status: "submitted", revision: 4, answers: { score: 1, reasoning: "Human-only reasoning" } });
    expect((await database.getProjectDetail(bundle.project.id))?.project.status).toBe("HUMAN_COMPLETE");
    database.close();
  });

  it("Workflow D: cascade-deletes every project-linked entity", async () => {
    const name = `workflow-d-${crypto.randomUUID()}`;
    const bundle = makeBundle(2);
    const database = await openSafeFlowDatabase(indexedDB, name);
    await database.importProjectBundle(bundle);
    await database.putAnnotation(annotation(bundle.items[0].id, bundle.project.id, "draft"));
    await database.putAnnotation({ ...annotation(bundle.items[0].id, bundle.project.id, "draft"), id: "other-annotation", validatorId: "other-validator" });
    await database.putAdjudicatedAnnotation({ id: "adjudicated", itemId: bundle.items[0].id, projectId: bundle.project.id, sourceAnnotationIds: [], answers: {}, createdAt: "now" });
    await database.deleteProject(bundle.project.id);
    expect(await database.listProjectSummaries()).toEqual([]);
    database.close();

    const native = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const linkedStores = [STORE_NAMES.projects, STORE_NAMES.validationItems, STORE_NAMES.annotations, STORE_NAMES.adjudicatedAnnotations, STORE_NAMES.judgeArtifacts, STORE_NAMES.referenceArtifacts, STORE_NAMES.importRuns];
    const transaction = native.transaction(linkedStores, "readonly");
    const counts = await Promise.all(linkedStores.map((store) => new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore(store).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })));
    expect(counts).toEqual(linkedStores.map(() => 0));
    native.close();
  });
});
