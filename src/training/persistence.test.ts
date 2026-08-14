import { describe, expect, it } from "vitest";
import { openSafeFlowDatabase } from "../storage/database";
import { airBenchStarterCurriculum } from "./curriculum";
import { createTrainingSession } from "./session";
import type { TrainingAttempt } from "./types";

function attempt(sessionId: string, itemId: string, attemptNumber: number): TrainingAttempt {
  const item = airBenchStarterCurriculum.items.find((candidate) => candidate.id === itemId)!;
  return {
    id: `attempt-${attemptNumber}`, sessionId, itemId, benchmarkId: "air-bench-2024", selectedLabel: item.correctLabel,
    confidence: "High", correct: true, referenceOpened: false, attemptNumber,
    trainingItemVersion: item.trainingItemVersion, explanationVersion: item.explanationVersion,
    rubricVersion: item.rubricVersion, benchmarkPackVersion: item.benchmarkPackVersion, completedAt: `2026-08-14T00:00:0${attemptNumber}.000Z`,
  };
}

describe("separate local training persistence", () => {
  it("survives database close/reopen without creating production annotations", async () => {
    const name = `training-${crypto.randomUUID()}`;
    const itemId = airBenchStarterCurriculum.items[0].id;
    const session = createTrainingSession(airBenchStarterCurriculum, { kind: "starter", itemIds: [itemId], now: "2026-08-14T00:00:00.000Z", createId: () => "session" });
    let database = await openSafeFlowDatabase(indexedDB, name);
    await database.putTrainingSession(session);
    await database.recordTrainingAttempt(attempt(session.id, itemId, 1), { ...session, updatedAt: "2026-08-14T00:00:01.000Z" });
    database.close();
    database = await openSafeFlowDatabase(indexedDB, name);
    expect(await database.getTrainingSession(session.id)).toMatchObject({ currentItemIndex: 0, status: "in-progress" });
    expect(await database.getTrainingAttemptsBySession(session.id)).toHaveLength(1);
    expect(await database.getProjectAnnotations("training-project-does-not-exist")).toEqual([]);
    expect(await database.listProjectSummaries()).toEqual([]);
    database.close();
  });

  it("appends retry attempts instead of overwriting the first attempt", async () => {
    const database = await openSafeFlowDatabase(indexedDB, `training-retry-${crypto.randomUUID()}`);
    const itemId = airBenchStarterCurriculum.items[0].id;
    const first = createTrainingSession(airBenchStarterCurriculum, { kind: "starter", itemIds: [itemId], createId: () => "first" });
    const retry = createTrainingSession(airBenchStarterCurriculum, { kind: "retry", itemIds: [itemId], createId: () => "retry" });
    await database.recordTrainingAttempt(attempt(first.id, itemId, 1), first);
    await database.recordTrainingAttempt({ ...attempt(retry.id, itemId, 2), id: "attempt-2" }, retry);
    expect(await database.getTrainingAttemptsByBenchmark("air-bench-2024")).toMatchObject([
      { sessionId: "first", attemptNumber: 1 }, { sessionId: "retry", attemptNumber: 2 },
    ]);
    database.close();
  });
});
