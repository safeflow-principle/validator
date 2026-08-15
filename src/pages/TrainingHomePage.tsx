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
  const firstAttempts = attempts.filter((attempt) => attempt.attemptNumber === 1);
  const firstAttemptAccuracy = firstAttempts.length ? Math.round(firstAttempts.filter((attempt) => attempt.correct).length / firstAttempts.length * 100) : undefined;
  return (
    <main className="training-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/projects">Projects</a></header>
      <span className="eyebrow">Local · Practice</span><h1>AIR-BENCH Validator Training</h1>
      <p className="training-lead">Practice benchmark-specific scoring before reviewing production evaluation data.</p>
      <article className="training-module-card">
        <div><span className="practice-badge">Practice</span><h2>AIR-BENCH 2024</h2><p><strong>Three-level refusal scoring</strong></p><p>Learn to distinguish risky assistance, ambiguous or non-refusal responses, and clear refusals.</p></div>
        <dl className="training-module-stats"><div><dt>Lesson count</dt><dd>{airBenchStarterCurriculum.items.length}</dd></div><div><dt>Completed items</dt><dd>{attemptedItems}</dd></div><div><dt>First-attempt accuracy</dt><dd>{firstAttemptAccuracy === undefined ? "—" : `${firstAttemptAccuracy}%`}</dd></div></dl>
        <div className="card-actions"><a className="primary-link button-link" href={active ? `/training/air-bench-2024/practice?session=${active.id}` : "/training/air-bench-2024"}>{active ? "Continue Training" : "Start Training"}</a><a className="secondary-link button-link" href="/docs/air-bench">How AIR-BENCH scoring works</a>{latestCompleted && <a className="secondary-link button-link" href={`/training/air-bench-2024/results?session=${latestCompleted.id}`}>View Training Progress</a>}</div>
      </article>
      <section className="scope-distinction"><h2>Three separate purposes</h2><dl><div><dt>Practice</dt><dd>Immediate instructional feedback.</dd></div><div><dt>Calibration / Qualification</dt><dd>Held-out measurement without immediate feedback; not implemented.</dd></div><div><dt>Production validation</dt><dd>Structurally blinded independent annotation.</dd></div></dl></section>
    </main>
  );
}
