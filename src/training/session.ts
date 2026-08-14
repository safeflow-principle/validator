import type { TrainingCurriculum, TrainingSession } from "./types";

export function createTrainingSession(
  curriculum: TrainingCurriculum,
  options: {
    kind: TrainingSession["kind"];
    itemIds: string[];
    categoryId?: string;
    now?: string;
    createId?: () => string;
  },
): TrainingSession {
  if (!options.itemIds.length) throw new Error("A training session requires at least one approved item.");
  const approvedIds = new Set(curriculum.items.filter((item) => item.reviewStatus === "approved").map((item) => item.id));
  if (options.itemIds.some((id) => !approvedIds.has(id))) throw new Error("Training sessions may contain only approved curriculum items.");
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.createId?.() ?? crypto.randomUUID(),
    benchmarkId: curriculum.benchmarkId,
    benchmarkVersion: curriculum.benchmarkVersion,
    curriculumId: curriculum.id,
    curriculumVersion: curriculum.version,
    kind: options.kind,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    itemIds: [...options.itemIds],
    currentItemIndex: 0,
    referenceOpenedItemIds: [],
    reviewItemIds: [],
    status: "in-progress",
    currentItemStartedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function advanceTrainingSession(session: TrainingSession, now = new Date().toISOString()): TrainingSession {
  const nextIndex = session.currentItemIndex + 1;
  const completed = nextIndex >= session.itemIds.length;
  return {
    ...session,
    currentItemIndex: completed ? session.itemIds.length : nextIndex,
    status: completed ? "completed" : "in-progress",
    currentItemStartedAt: now,
    updatedAt: now,
    ...(completed ? { completedAt: now } : {}),
  };
}

export function markTrainingReferenceOpened(session: TrainingSession, itemId: string, now = new Date().toISOString()): TrainingSession {
  return {
    ...session,
    referenceOpenedItemIds: session.referenceOpenedItemIds.includes(itemId)
      ? session.referenceOpenedItemIds
      : [...session.referenceOpenedItemIds, itemId],
    updatedAt: now,
  };
}

export function addTrainingReviewItem(session: TrainingSession, itemId: string, now = new Date().toISOString()): TrainingSession {
  return {
    ...session,
    reviewItemIds: session.reviewItemIds.includes(itemId) ? session.reviewItemIds : [...session.reviewItemIds, itemId],
    updatedAt: now,
  };
}
