import { describe, expect, it } from "vitest";
import { openSafeFlowDatabase } from "./database";
import { DATABASE_SCHEMA, STORE_NAMES } from "./schema";

describe("local database", () => {
  it("creates every declared store", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const db = await openSafeFlowDatabase(indexedDB, name);
    const native = await new Promise<IDBDatabase>((resolve, reject) => {
      db.close();
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect([...native.objectStoreNames].sort()).toEqual(Object.keys(DATABASE_SCHEMA).sort());
    native.close();
  });

  it("returns a structurally blinded item", async () => {
    const db = await openSafeFlowDatabase(indexedDB, `test-${crypto.randomUUID()}`);
    await db.putValidationItem({
      id: "i1", projectId: "p1", prompt: "prompt", response: "response", metadata: { referenceLabel: "must-not-leak" }, createdAt: "now",
    });
    await db.putJudgeArtifact({
      id: "j1", itemId: "i1", judgeId: "judge", score: 4, reasoning: "must-not-leak", metadata: {}, createdAt: "now",
    });
    const item = await db.getBlindedItem("i1");
    expect(item).toEqual({ id: "i1", projectId: "p1", prompt: "prompt", response: "response" });
    expect(JSON.stringify(item)).not.toContain("must-not-leak");
    expect(STORE_NAMES.judgeArtifacts).not.toBe(STORE_NAMES.annotations);
    db.close();
  });

  it("commits an imported project and its blinded artifacts atomically", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const db = await openSafeFlowDatabase(indexedDB, name);
    await db.importProjectBundle({
      project: { id: "p", name: "project", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test", status: "READY", createdAt: "now", updatedAt: "now" },
      items: [{ id: "i", projectId: "p", externalId: "one", prompt: "prompt", response: "response", metadata: {}, createdAt: "now" }],
      judgeArtifacts: [{ id: "j", itemId: "i", judgeId: "imported", score: 0, reasoning: "isolated reasoning", metadata: {}, createdAt: "now" }],
      referenceArtifacts: [{ id: "r", itemId: "i", label: "isolated label", createdAt: "now" }],
      importRun: { id: "run", projectId: "p", sourceName: "local.csv", status: "complete", itemCount: 1, errors: [], createdAt: "now" },
    });
    const blinded = await db.getBlindedItem("i");
    expect(blinded).toEqual({ id: "i", projectId: "p", externalId: "one", prompt: "prompt", response: "response" });
    expect(JSON.stringify(blinded)).not.toMatch(/isolated reasoning|isolated label/);
    db.close();
  });

  it("rejects stale annotation revisions", async () => {
    const db = await openSafeFlowDatabase(indexedDB, `test-${crypto.randomUUID()}`);
    await db.putProject({ id: "p", name: "project", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test", status: "READY", createdAt: "now", updatedAt: "now" });
    await db.putValidationItem({ id: "i", projectId: "p", prompt: "prompt", response: "response", metadata: {}, createdAt: "now" });
    const stored = { id: "a", itemId: "i", projectId: "p", validatorId: "local-validator", benchmarkPackId: "air-bench-2024", status: "draft" as const, answers: {}, evidenceSpans: [], revision: 2, createdAt: "now", updatedAt: "now" };
    await db.putAnnotation(stored);
    await expect(db.saveAnnotation(stored)).rejects.toThrow(/revision must increase/);
    db.close();
  });

  it("migrates legacy annotations to explicit benchmark-pack and rubric versions", async () => {
    const name = `legacy-v2-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(STORE_NAMES.projects, { keyPath: "id" });
        const annotations = db.createObjectStore(STORE_NAMES.annotations, { keyPath: "id" });
        annotations.createIndex("by-project", "projectId");
        db.createObjectStore(STORE_NAMES.validationItems, { keyPath: "id" }).createIndex("by-project", "projectId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = legacy.transaction([STORE_NAMES.projects, STORE_NAMES.annotations], "readwrite");
    transaction.objectStore(STORE_NAMES.projects).put({ id: "p", name: "legacy", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "legacy-pack", status: "HUMAN_COMPLETE", createdAt: "now", updatedAt: "now" });
    transaction.objectStore(STORE_NAMES.annotations).put({ id: "a", itemId: "i", projectId: "p", validatorId: "local-validator", benchmarkPackId: "air-bench-2024", status: "submitted", answers: {}, evidenceSpans: [], revision: 1, createdAt: "now", updatedAt: "now", submittedAt: "now" });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    legacy.close();

    const migrated = await openSafeFlowDatabase(indexedDB, name);
    expect(await migrated.getAnnotation("a")).toMatchObject({ benchmarkPackVersion: "legacy-pack", rubricVersion: "legacy-pack" });
    migrated.close();
  });
});
