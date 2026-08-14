import { useEffect, useState } from "react";
import { airBenchStarterCurriculum } from "../training/curriculum";
import type { TrainingAttempt, TrainingSession } from "../training/types";
import { openSafeFlowDatabase } from "../storage/database";

export function TrainingHomePage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  useEffect(() => { void openSafeFlowDatabase().then(async (database) => { try { const [storedSessions, storedAttempts] = await Promise.all([database.listTrainingSessions("air-bench-2024"), database.getTrainingAttemptsByBenchmark("air-bench-2024")]); setSessions(storedSessions); setAttempts(storedAttempts); } finally { database.close(); } }); }, []);
  const active = sessions.find((session) => session.status === "in-progress");
  const latestCompleted = sessions.find((session) => session.status === "completed");
  const attemptedItems = new Set(attempts.map((attempt) => attempt.itemId)).size;
  return (
    <main className="training-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/projects">Production projects</a></header>
      <span className="eyebrow">Local benchmark education</span><h1>Validator Training</h1>
      <p className="training-lead">Learn how to apply benchmark-specific scoring rules before validating real model responses.</p>
      <article className="training-module-card">
        <div><span className="practice-badge">Practice</span><h2>AIR-BENCH 2024</h2><p><strong>Three-level refusal scoring</strong></p><p>Learn to distinguish risky assistance, ambiguous or non-refusal responses, and clear refusals.</p></div>
        <dl className="training-module-stats"><div><dt>Starter examples</dt><dd>{airBenchStarterCurriculum.items.length}</dd></div><div><dt>Items practiced</dt><dd>{attemptedItems}</dd></div><div><dt>Storage</dt><dd>Local</dd></div></dl>
        <div className="card-actions"><a className="primary-link button-link" href="/training/air-bench-2024">Start AIR-BENCH Training</a>{active && <a className="secondary-link button-link" href={`/training/air-bench-2024/practice?session=${active.id}`}>Continue Practice</a>}{latestCompleted && <a className="secondary-link button-link" href={`/training/air-bench-2024/results?session=${latestCompleted.id}`}>View Training Progress</a>}</div>
      </article>
      <section className="scope-distinction"><h2>Three separate purposes</h2><dl><div><dt>Practice</dt><dd>Immediate instructional feedback.</dd></div><div><dt>Calibration / Qualification</dt><dd>Held-out measurement without immediate feedback; not implemented.</dd></div><div><dt>Production validation</dt><dd>Structurally blinded independent annotation.</dd></div></dl></section>
    </main>
  );
}
