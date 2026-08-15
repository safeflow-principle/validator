import { useEffect, useMemo, useState } from "react";
import { getOrCreateJudgeAnalysisReport } from "../analysis/createJudgeAnalysisReport";
import { AIR_BENCH_SCORE_ORDER, type JudgeAnalysisReport, type TaxonomyBreakdownLevel } from "../analysis/reportTypes";
import type { JudgeAnalysis } from "../analysis/types";
import { airBenchTaxonomy } from "../benchmarks/airBenchTaxonomy";
import type { FinalizedHumanAnnotation, HumanValidationFinalization } from "../finalization/types";
import { openSafeFlowDatabase } from "../storage/database";

function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function metric(value: number | null) { return value === null ? "Not available" : value.toFixed(3); }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`; }

function categoryPath(annotation: FinalizedHumanAnnotation) {
  const leaf = airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === annotation.categoryId);
  if (!leaf) return [annotation.taxonomyPath?.level1, annotation.taxonomyPath?.level2, annotation.taxonomyPath?.level3, annotation.taxonomyPath?.level4].filter(Boolean).join(" → ") || annotation.categoryId || "Unavailable";
  const relationship = leaf.conceptualLevel3;
  const level3 = relationship.kind === "single"
    ? airBenchTaxonomy.conceptualLevel3Nodes.find((node) => node.id === relationship.nodeId)?.name
    : relationship.dimensions.map((dimension) => airBenchTaxonomy.conceptualLevel3Nodes.find((node) => node.id === dimension.nodeId)?.name).filter(Boolean).join(" × ");
  return [leaf.level1.name, leaf.level2.name, level3, leaf.level4.name].filter(Boolean).join(" → ");
}

export function JudgeAnalysisPage({ projectId, analysisId }: { projectId: string; analysisId: string }) {
  const [state, setState] = useState<{ analysis: JudgeAnalysis; finalization: HumanValidationFinalization; report: JudgeAnalysisReport } | null>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<{ label: string; itemIds: string[] }>();
  const [categoryLevel, setCategoryLevel] = useState<TaxonomyBreakdownLevel>("level1");
  useEffect(() => {
    void openSafeFlowDatabase().then(async (database) => {
      try {
        const analysis = await database.getJudgeAnalysis(analysisId);
        if (!analysis || analysis.projectId !== projectId) { setState(null); return; }
        const finalization = await database.getHumanValidationFinalization(analysis.finalizationId);
        if (!finalization) { setState(null); return; }
        const report = await getOrCreateJudgeAnalysisReport(database, analysis.id);
        setState({ analysis, finalization, report });
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the reliability report."); setState(null); }
      finally { database.close(); }
    });
  }, [analysisId, projectId]);
  const humanByItem = useMemo<Map<string, FinalizedHumanAnnotation>>(() => state ? new Map(state.finalization.annotations.map((annotation) => [annotation.itemId, annotation])) : new Map(), [state]);
  if (state === undefined) return <main className="loading-screen"><p>Opening immutable judge analysis…</p></main>;
  if (state === null) return <main className="project-shell"><h1>Judge analysis unavailable</h1>{error && <p className="error-banner">{error}</p>}<a href={`/projects/${projectId}`}>Back to project</a></main>;
  const { analysis, report } = state;
  const selectedIds = new Set(filter?.itemIds ?? analysis.comparisons.map((comparison) => comparison.itemId));
  const visibleComparisons = analysis.comparisons.filter((comparison) => selectedIds.has(comparison.itemId));
  const categoryRows = report.categoryBreakdowns.filter((row) => row.level === categoryLevel);
  const choose = (label: string, itemIds: string[]) => setFilter({ label, itemIds });
  return <main className="project-shell judge-analysis-shell">
    <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/projects/${projectId}`}>Project overview</a></header>
    <span className="status-pill">UNBLINDED</span><span className="eyebrow">Immutable analysis report</span><h1>Judge Validation</h1>
    <p className="warning-banner">Automated-judge results are visible. Human labels are frozen in finalization <code>{analysis.finalizationId}</code>; report methodology is version <code>{report.methodology.version}</code>.</p>

    <section className="judge-metrics" aria-label="Judge reliability metrics">
      <button onClick={() => choose("All compared cases", analysis.comparisons.map((row) => row.itemId))}><strong>{report.metrics.n}</strong><span>N</span></button>
      <button onClick={() => choose("Exact agreements", analysis.comparisons.filter((row) => row.exactAgreement).map((row) => row.itemId))}><strong>{percent(report.metrics.exactAgreementRate)}</strong><span>Exact agreement</span></button>
      <div><strong>{metric(report.metrics.cohenKappa)}</strong><span>Cohen’s κ</span></div><div><strong>{metric(report.metrics.linearWeightedKappa)}</strong><span>Linearly weighted κ</span></div>
      <div><strong>{report.metrics.meanAbsoluteError.toFixed(3)}</strong><span>Mean absolute error</span></div><div><strong>{signed(report.metrics.directionalBias)}</strong><span>Mean judge − human</span></div>
    </section>
    <p className="methodology-note">κ is descriptive, not a standalone acceptability decision. Positive directional bias means more refusal-like judge scores; negative means more assistance-like scores.</p>

    <section className="severe-errors"><h2>Severe disagreements</h2><div className="severe-error-grid">
      <button onClick={() => choose("Human 0 → Judge 1", report.severeDisagreements.human0Judge1ItemIds)}><strong>{report.metrics.human0Judge1Count}</strong><span>Human 0 → Judge 1</span><small>Potential missed risky assistance</small></button>
      <button onClick={() => choose("Human 1 → Judge 0", report.severeDisagreements.human1Judge0ItemIds)}><strong>{report.metrics.human1Judge0Count}</strong><span>Human 1 → Judge 0</span><small>Potential over-penalized refusal</small></button>
      <button onClick={() => choose("All severe disagreements", [...report.severeDisagreements.human0Judge1ItemIds, ...report.severeDisagreements.human1Judge0ItemIds])}><strong>{percent(report.metrics.severeDisagreementRate)}</strong><span>Total severe rate</span><small>{report.metrics.severeDisagreementCount} cases</small></button>
    </div></section>

    <section className="confusion-section"><h2>Confusion Matrix</h2><p>Human labels are rows; automated-judge labels are columns.</p><table className="confusion-matrix"><thead><tr><th scope="col">Human ↓ / Judge →</th>{AIR_BENCH_SCORE_ORDER.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{AIR_BENCH_SCORE_ORDER.map((human) => <tr key={human}><th scope="row">{human}</th>{AIR_BENCH_SCORE_ORDER.map((judge) => {
      const cell = report.confusionMatrix.cells.find((candidate) => candidate.humanScore === human && candidate.judgeScore === judge)!;
      return <td key={judge}><button aria-label={`Human ${human}, Judge ${judge}: ${cell.count} cases`} onClick={() => choose(`Human ${human} / Judge ${judge}`, cell.itemIds)}>{cell.count}</button></td>;
    })}</tr>)}</tbody></table></section>

    <section className="category-performance"><h2>Performance by AIR-BENCH Category</h2><div className="filter-row" role="group" aria-label="Taxonomy level">{(["level1", "level2", "level3", "level4"] as const).map((level) => <button aria-pressed={categoryLevel === level} className={categoryLevel === level ? "active" : ""} key={level} onClick={() => setCategoryLevel(level)} type="button">{level.replace("level", "Level ")}</button>)}</div>
      <div className="category-table-wrap"><table><thead><tr><th>Category</th><th>n</th><th>Exact</th><th>Severe</th><th>MAE</th><th>κ</th></tr></thead><tbody>{categoryRows.map((row) => {
        const groupComparisons = analysis.comparisons.filter((comparison) => row.itemIds.includes(comparison.itemId));
        return <tr key={`${row.level}:${row.categoryId}`}><th scope="row">{row.categoryName}{row.reliabilityNote && <small>{row.reliabilityNote}</small>}</th>
          <td><button onClick={() => choose(`${row.categoryName}: all cases`, row.itemIds)}>{row.metrics.n}</button></td>
          <td><button onClick={() => choose(`${row.categoryName}: exact agreements`, groupComparisons.filter((comparison) => comparison.exactAgreement).map((comparison) => comparison.itemId))}>{percent(row.metrics.exactAgreementRate)}</button></td>
          <td><button onClick={() => choose(`${row.categoryName}: severe disagreements`, groupComparisons.filter((comparison) => { const human = Number(comparison.humanNumericValue ?? comparison.humanLabelId); const judge = Number(comparison.judgeScore); return Math.abs(human - judge) === 1; }).map((comparison) => comparison.itemId))}>{row.metrics.severeDisagreementCount}</button></td>
          <td>{row.metrics.meanAbsoluteError.toFixed(3)}</td><td>{metric(row.metrics.cohenKappa)}</td></tr>;
      })}</tbody></table></div>
    </section>

    <section className="finalized-item-list"><div className="case-list-heading"><div><h2>Case drill-down</h2><p>{filter?.label ?? "All compared cases"} · {visibleComparisons.length} case(s)</p></div>{filter && <button className="secondary-button" onClick={() => setFilter(undefined)} type="button">Show all</button>}</div>{visibleComparisons.map((comparison) => {
      const human = humanByItem.get(comparison.itemId)!;
      return <details className="finalized-item" key={comparison.itemId}><summary><span>{comparison.externalItemId ?? comparison.itemId}</span><strong>{comparison.exactAgreement ? "Agreement" : "Disagreement"}</strong><small>Human {comparison.humanLabelId} · Judge {String(comparison.judgeScore)}</small></summary>
        <div className="finalized-item-body"><section><h3>AIR-BENCH category path</h3><p>{categoryPath(human)}</p><h3>Prompt</h3><p>{human.prompt}</p><h3>Response</h3><p>{human.response}</p></section><dl>
          <div><dt>Finalized human score</dt><dd>{comparison.humanLabelId}</dd></div><div><dt>Human confidence</dt><dd>{human.confidence}</dd></div><div><dt>Human reasoning</dt><dd>{human.reasoning ?? "—"}</dd></div><div><dt>Human evidence</dt><dd>{human.evidenceSpans.length ? human.evidenceSpans.map((span) => `${span.quotedText} (${span.startOffset}–${span.endOffset})`).join(" · ") : "—"}</dd></div>
          <div><dt>Automated judge score</dt><dd>{String(comparison.judgeScore)}</dd></div><div><dt>Judge reasoning</dt><dd>{comparison.judgeReasoning ?? "—"}</dd></div><div><dt>Source item ID</dt><dd>{comparison.externalItemId ?? comparison.itemId}</dd></div><div><dt>Human finalization ID</dt><dd>{analysis.finalizationId}</dd></div><div><dt>Judge-analysis ID</dt><dd>{analysis.id}</dd></div>
        </dl></div></details>;
    })}</section>
    <details className="technical-provenance"><summary>View immutable report provenance</summary><dl>
      <div><dt>Report ID</dt><dd>{report.id}</dd></div><div><dt>Report SHA-256</dt><dd>{report.reportHash}</dd></div><div><dt>Methodology</dt><dd>{report.methodology.version}</dd></div><div><dt>Analysis ID</dt><dd>{analysis.id}</dd></div><div><dt>Analysis SHA-256</dt><dd>{analysis.analysisHash}</dd></div><div><dt>Human finalization ID</dt><dd>{analysis.finalizationId}</dd></div><div><dt>Human snapshot SHA-256</dt><dd>{analysis.finalizationHash}</dd></div><div><dt>Judge artifact-set SHA-256</dt><dd>{analysis.judgeArtifactSetHash}</dd></div><div><dt>Bias formula</dt><dd>{report.methodology.directionalBiasFormula}</dd></div><div><dt>MAE formula</dt><dd>{report.methodology.meanAbsoluteErrorFormula}</dd></div>
    </dl></details>
  </main>;
}
