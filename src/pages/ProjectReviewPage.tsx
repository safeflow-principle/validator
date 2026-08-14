import { useEffect, useMemo, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation, BlindedValidationItem, ProjectDetail } from "../core/types";
import { openSafeFlowDatabase } from "../storage/database";

type Filter = "All" | "Flagged" | "Low confidence" | "Score 0" | "Score 0.5" | "Score 1" | "Incomplete";
const filters: Filter[] = ["All", "Flagged", "Low confidence", "Score 0", "Score 0.5", "Score 1", "Incomplete"];

export function ProjectReviewPage({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectDetail>();
  const [items, setItems] = useState<BlindedValidationItem[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  useEffect(() => {
    void openSafeFlowDatabase().then(async (database) => {
      try {
        const [projectDetail, projectItems, humanAnnotations] = await Promise.all([
          database.getProjectDetail(projectId), database.getBlindedProjectItems(projectId), database.getProjectAnnotations(projectId),
        ]);
        if (!projectDetail) return;
        setDetail(projectDetail); setItems(projectItems); setAnnotations(humanAnnotations);
        if (projectDetail.project.status !== "HUMAN_COMPLETE") await database.setProjectStatus(projectId, "REVIEW");
      } finally { database.close(); }
    });
  }, [projectId]);
  const byItem = useMemo(() => new Map(annotations.map((annotation) => [annotation.itemId, annotation])), [annotations]);
  const visible = items.filter((item) => {
    const annotation = byItem.get(item.id);
    if (filter === "Flagged") return annotation?.answers["needs-review"] === true;
    if (filter === "Low confidence") return annotation?.answers.confidence === "Low";
    if (filter === "Incomplete") return annotation?.status !== "submitted";
    if (filter.startsWith("Score ")) return annotation?.answers.score === Number(filter.slice(6));
    return true;
  });
  if (!detail) return <main className="loading-screen"><p>Loading human annotations…</p></main>;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const complete = detail.progress.total > 0 && detail.progress.submitted === detail.progress.total;
  return (
    <main className="project-shell review-shell">
      <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/projects/${projectId}`}>Project overview</a></header>
      <span className="eyebrow">Human annotations only</span><h1>Review annotations</h1>
      {complete && <section className="completion-banner"><h2>Human validation complete</h2><p>Automated-judge results remain blinded.</p><strong>Review Before Finalization</strong></section>}
      <div className="filter-row" aria-label="Annotation filters">{filters.map((candidate) => <button aria-pressed={candidate === filter} key={candidate} onClick={() => setFilter(candidate)} type="button">{candidate}</button>)}</div>
      <div className="review-list">
        {visible.map((item) => {
          const annotation = byItem.get(item.id);
          const category = pack.categories.find((candidate) => candidate.id === item.categoryId);
          return <article className="review-card" key={item.id}>
            <div><span className="eyebrow">{item.externalId ?? item.id}</span><h2>{category?.name ?? item.categoryId ?? "Uncategorized"}</h2></div>
            <dl>
              <div><dt>Human score</dt><dd>{annotation?.answers.score ?? "Incomplete"}</dd></div>
              <div><dt>Confidence</dt><dd>{annotation?.answers.confidence ?? "—"}</dd></div>
              <div><dt>Reason</dt><dd>{annotation?.answers.reasoning ?? "—"}</dd></div>
              <div><dt>Evidence</dt><dd>{annotation?.evidenceSpans.length ? annotation.evidenceSpans.map((span) => span.text).join(" · ") : "—"}</dd></div>
              <div><dt>Flag</dt><dd>{annotation?.answers["needs-review"] === true ? "Needs review" : "No"}</dd></div>
            </dl>
            <a className="secondary-link button-link" href={`/projects/${projectId}/annotate?item=${item.id}`}>Open for editing</a>
          </article>;
        })}
      </div>
    </main>
  );
}
