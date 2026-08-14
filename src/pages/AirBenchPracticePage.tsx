import { useEffect, useMemo, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { airBenchTaxonomy } from "../benchmarks/airBenchTaxonomy";
import { buildTaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import { openSafeFlowDatabase } from "../storage/database";
import { approvedTrainingItem, airBenchStarterCurriculum } from "../training/curriculum";
import { addTrainingReviewItem, advanceTrainingSession, markTrainingReferenceOpened } from "../training/session";
import { TrainingItemView } from "../training/TrainingItemView";
import type { TrainingAttempt, TrainingConfidence, TrainingLabel, TrainingSession } from "../training/types";

export function AirBenchPracticePage() {
  const sessionId = new URLSearchParams(window.location.search).get("session") ?? "";
  const [session, setSession] = useState<TrainingSession>();
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<TrainingLabel>();
  const [confidence, setConfidence] = useState<TrainingConfidence>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { void openSafeFlowDatabase().then(async (database) => { try { const stored = await database.getTrainingSession(sessionId); if (!stored) throw new Error("Training session not found."); if (stored.status === "completed") { window.location.replace(`/training/air-bench-2024/results?session=${stored.id}`); return; } setSession(stored); setAttempts(await database.getTrainingAttemptsBySession(stored.id)); } finally { database.close(); } }).catch(() => window.location.replace("/training/air-bench-2024")); }, [sessionId]);
  const item = session ? approvedTrainingItem(session.itemIds[session.currentItemIndex]) : undefined;
  const attempt = useMemo(() => item ? attempts.find((candidate) => candidate.itemId === item.id) : undefined, [attempts, item]);
  const pack = loadBundledBenchmarkPack("air-bench-2024");
  const leaf = item ? airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === item.categoryId) : undefined;
  const reference = leaf ? buildTaxonomyReferenceView(leaf, airBenchTaxonomy.conceptualLevel3Nodes) : undefined;
  if (!session || !item || !reference) return <main className="loading-screen"><p>Opening local practice session…</p></main>;
  const activeSession = session;
  const activeItem = item;

  async function openReference() {
    if (attempt || activeSession.referenceOpenedItemIds.includes(activeItem.id)) return;
    const updated = markTrainingReferenceOpened(activeSession, activeItem.id);
    setSession(updated);
    const database = await openSafeFlowDatabase(); try { await database.putTrainingSession(updated); } finally { database.close(); }
  }
  async function checkAnswer() {
    if (!selectedLabel || !confidence || saving || attempt) return;
    setSaving(true);
    const database = await openSafeFlowDatabase();
    try {
      const allAttempts = await database.getTrainingAttemptsByBenchmark(activeSession.benchmarkId);
      const now = new Date().toISOString();
      const completed: TrainingAttempt = {
        id: crypto.randomUUID(), sessionId: activeSession.id, itemId: activeItem.id, benchmarkId: activeSession.benchmarkId,
        selectedLabel, confidence, correct: selectedLabel === activeItem.correctLabel,
        referenceOpened: activeSession.referenceOpenedItemIds.includes(activeItem.id),
        attemptNumber: allAttempts.filter((candidate) => candidate.itemId === activeItem.id).length + 1,
        durationMs: Math.max(0, Date.parse(now) - Date.parse(activeSession.currentItemStartedAt)),
        trainingItemVersion: activeItem.trainingItemVersion, explanationVersion: activeItem.explanationVersion,
        rubricVersion: activeItem.rubricVersion, benchmarkPackVersion: activeItem.benchmarkPackVersion, completedAt: now,
      };
      const updatedSession: TrainingSession = { ...activeSession, updatedAt: now };
      await database.recordTrainingAttempt(completed, updatedSession);
      setSession(updatedSession); setAttempts((current) => [...current, completed]);
    } finally { database.close(); setSaving(false); }
  }
  async function next() {
    const updated = advanceTrainingSession(activeSession);
    const database = await openSafeFlowDatabase(); try { await database.putTrainingSession(updated); } finally { database.close(); }
    if (updated.status === "completed") window.location.assign(`/training/air-bench-2024/results?session=${updated.id}`);
    else { setSession(updated); setSelectedLabel(undefined); setConfidence(undefined); }
  }
  async function addReview() {
    const updated = addTrainingReviewItem(activeSession, activeItem.id); setSession(updated);
    const database = await openSafeFlowDatabase(); try { await database.putTrainingSession(updated); } finally { database.close(); }
  }
  return <TrainingItemView attempt={attempt} confidence={confidence} item={activeItem} onAddReview={() => void addReview()} onCheck={() => void checkAnswer()} onConfidenceChange={setConfidence} onLabelChange={setSelectedLabel} onNext={() => void next()} onReferenceOpen={() => void openReference()} pack={pack} position={activeSession.currentItemIndex + 1} reviewAdded={activeSession.reviewItemIds.includes(activeItem.id)} saving={saving} selectedLabel={selectedLabel} taxonomyReference={reference} total={activeSession.itemIds.length} />;
}
