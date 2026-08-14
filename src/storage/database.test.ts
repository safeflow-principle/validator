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
      project: { id: "p", name: "project", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test", status: "active", createdAt: "now", updatedAt: "now" },
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
});
