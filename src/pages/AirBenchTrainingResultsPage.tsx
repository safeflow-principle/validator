import { useEffect, useMemo, useState } from "react";
import { openSafeFlowDatabase } from "../storage/database";
import { approvedTrainingItem, airBenchStarterCurriculum } from "../training/curriculum";
import { calculateTrainingProgress } from "../training/progress";
import { createTrainingSession } from "../training/session";
import type { TrainingAttempt, TrainingSession } from "../training/types";

export function AirBenchTrainingResultsPage() {
  const requestedId = new URLSearchParams(window.location.search).get("session");
  const [session, setSession] = useState<TrainingSession>();
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [allAttempts, setAllAttempts] = useState<TrainingAttempt[]>([]);
  const [starting, setStarting] = useState(false);
  useEffect(() => { void openSafeFlowDatabase().then(async (database) => { try { const sessions = await database.listTrainingSessions("air-bench-2024"); const selected = requestedId ? sessions.find((candidate) => candidate.id === requestedId) : sessions.find((candidate) => candidate.status === "completed"); if (!selected) throw new Error("No completed training session found."); setSession(selected); const [sessionAttempts, benchmarkAttempts] = await Promise.all([database.getTrainingAttemptsBySession(selected.id), database.getTrainingAttemptsByBenchmark(selected.benchmarkId)]); setAttempts(sessionAttempts); setAllAttempts(benchmarkAttempts); } finally { database.close(); } }).catch(() => window.location.replace("/training")); }, [requestedId]);
  const items = useMemo(() => session ? session.itemIds.flatMap((id) => approvedTrainingItem(id) ? [approvedTrainingItem(id)!] : []) : [], [session]);
  const summary = useMemo(() => calculateTrainingProgress(items, attempts, allAttempts), [items, attempts, allAttempts]);
  if (!session) return <main className="loading-screen"><p>Calculating local training results…</p></main>;
  const wrongItemIds = attempts.filter((attempt) => !attempt.correct).map((attempt) => attempt.itemId);
  async function retryMistakes() {
    if (!wrongItemIds.length || starting) return; setStarting(true);
    const retry = createTrainingSession(airBenchStarterCurriculum, { kind: "retry", itemIds: wrongItemIds });
    const database = await openSafeFlowDatabase(); try { await database.putTrainingSession(retry); } finally { database.close(); }
    window.location.assign(`/training/air-bench-2024/practice?session=${retry.id}`);
  }
  return (
    <main className="training-shell training-results">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/training">Training home</a></header>
      <span className="eyebrow">Practice results · not certification</span><h1>AIR-BENCH Training Results</h1>
      <section className="results-hero"><div><strong>{summary.itemsCorrect} / {session.itemIds.length}</strong><span>correct in this session</span></div><div><strong>{summary.firstAttemptAccuracy}%</strong><span>first-attempt accuracy</span></div><div><strong>{summary.severeErrors}</strong><span>severe errors</span></div></section>
      <div className="results-grid">
        <section className="result-card"><h2>Confidence calibration</h2><p>Average confidence: {summary.averageConfidence || "—"} / 3</p><dl>{Object.entries(summary.confidenceCalibration).map(([confidence, calibration]) => <div key={confidence}><dt>{confidence}-confidence answers</dt><dd>{calibration.attempts ? `${calibration.accuracy}% correct (${calibration.correct}/${calibration.attempts})` : "No attempts"}</dd></div>)}</dl></section>
        <section className="result-card"><h2>Category areas</h2><h3>Strong areas</h3>{summary.strongAreas.length ? <ul>{summary.strongAreas.map((area) => <li key={area}>{area}</li>)}</ul> : <p>Complete more correct examples to establish a strong area.</p>}<h3>Needs more practice</h3>{summary.needsPractice.length ? <ul>{summary.needsPractice.map((area) => <li key={area}>{area}</li>)}</ul> : <p>No weak area detected in this session.</p>}</section>
        <section className="result-card"><h2>Mistake patterns</h2>{summary.mistakePatterns.length ? summary.mistakePatterns.map((pattern) => <article key={pattern.tag}><strong>{pattern.message}</strong><p>Observed in {pattern.count} of {pattern.opportunities} relevant questions.</p></article>) : <p>No repeated predefined mistake pattern was detected.</p>}</section>
        <section className="result-card"><h2>Question review</h2><ol>{items.map((item) => { const itemAttempt = attempts.find((attempt) => attempt.itemId === item.id); return <li key={item.id}><span>{itemAttempt?.correct ? "Correct" : "Review"}</span> {item.id.replace(/^starter-\d+-/, "").replace(/-/g, " ")} · selected {itemAttempt?.selectedLabel ?? "—"}</li>; })}</ol></section>
      </div>
      <div className="page-actions">{wrongItemIds.length > 0 && <button className="primary-button" disabled={starting} onClick={() => void retryMistakes()} type="button">{starting ? "Preparing retry…" : "Practice Mistakes Again"}</button>}<a className="secondary-link button-link" href="/training/air-bench-2024">Return to AIR-BENCH training</a></div>
      <p className="training-privacy-note">These results are practice records stored locally. They are not production annotations, qualification, or certification.</p>
    </main>
  );
}
