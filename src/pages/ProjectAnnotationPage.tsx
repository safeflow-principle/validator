import { useEffect, useReducer, useRef, useState } from "react";
import { AnnotationScreen } from "../annotation/AnnotationScreen";
import { annotationTransition, initialAnnotationState } from "../annotation/stateMachine";
import { airBenchTaxonomy } from "../benchmarks/airBenchTaxonomy";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { buildTaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import type { Annotation, BlindedValidationItem, ProjectDetail } from "../core/types";
import { findResumeItemId } from "../projects/progress";
import { openSafeFlowDatabase } from "../storage/database";
import { LOCAL_VALIDATOR_ID } from "../core/constants";
import { IndexedDbAnnotationRepository, type AnnotationRepository } from "../repositories/annotationRepository";
import type { HumanValidationFinalization } from "../finalization/types";

async function openLocalAnnotationRepository(): Promise<AnnotationRepository> {
  return new IndexedDbAnnotationRepository(await openSafeFlowDatabase(), LOCAL_VALIDATOR_ID);
}

export function ProjectAnnotationPage({ projectId, repositoryFactory = openLocalAnnotationRepository, projectBasePath = "/projects" }: { projectId: string; repositoryFactory?: () => Promise<AnnotationRepository>; projectBasePath?: string }) {
  const [state, dispatch] = useReducer(annotationTransition, initialAnnotationState);
  const [items, setItems] = useState<BlindedValidationItem[]>([]);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [activeItemId, setActiveItemId] = useState<string>();
  const [finalization, setFinalization] = useState<HumanValidationFinalization>();
  const annotations = useRef(new Map<string, Annotation>());
  const database = useRef<AnnotationRepository | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void repositoryFactory().then(async (db) => {
      database.current = db;
      const [projectDetail, projectItems, projectAnnotations] = await Promise.all([
        db.getProjectDetail(projectId), db.getBlindedProjectItems(projectId), db.getProjectAnnotations(projectId),
      ]);
      if (!projectDetail) throw new Error("Project not found.");
      if (projectDetail.project.status === "HUMAN_FINALIZED" || projectDetail.project.status === "UNBLINDED") {
        const latest = await db.getLatestHumanValidationFinalization?.(projectId);
        if (latest && !cancelled) { setDetail(projectDetail); setFinalization(latest); return; }
        window.location.replace(`${projectBasePath}/${projectId}`);
        return;
      }
      annotations.current = new Map(projectAnnotations.map((annotation) => [annotation.itemId, annotation]));
      const requested = new URLSearchParams(window.location.search).get("item");
      const itemId = requested && projectItems.some((item) => item.id === requested)
        ? requested
        : findResumeItemId(projectItems, projectAnnotations);
      if (!itemId) {
        window.location.replace(`${projectBasePath}/${projectId}/review`);
        return;
      }
      const now = new Date().toISOString();
      const validatorId = await db.validatorId();
      const annotation = annotations.current.get(itemId) ?? {
        id: `${itemId}:${validatorId}`,
        itemId,
        projectId,
        validatorId,
        benchmarkPackId: projectDetail.project.benchmarkPackId,
        benchmarkPackVersion: projectDetail.project.benchmarkPackVersion,
        rubricVersion: projectDetail.project.benchmarkPackVersion,
        status: "draft" as const,
        answers: {},
        evidenceSpans: [],
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      if (!cancelled) {
        setItems(projectItems);
        setDetail(projectDetail);
        setActiveItemId(itemId);
        dispatch({ type: "LOADED", annotation });
        if (projectDetail.project.status !== "HUMAN_COMPLETE") await db.setProjectStatus(projectId, "VALIDATING");
      }
    }).catch(() => { if (!cancelled) window.location.replace(`${projectBasePath}/${projectId}`); });
    return () => { cancelled = true; database.current?.close(); };
  }, [projectId, repositoryFactory, projectBasePath]);

  useEffect(() => {
    if (state.value !== "editing" || !state.dirty) return;
    const timer = window.setTimeout(() => dispatch({ type: "SAVE_REQUESTED", intent: "autosave" }), 500);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state.value !== "saving" || !database.current) return;
    const intent = state.intent;
    const savingAnnotation = state.savingAnnotation;
    const timestamp = new Date().toISOString();
    const submitted = intent === "submit" || savingAnnotation.status === "submitted";
    const persisted: Annotation = {
      ...savingAnnotation,
      status: submitted ? "submitted" : "draft",
      revision: savingAnnotation.revision + 1,
      updatedAt: timestamp,
      ...(submitted ? { submittedAt: intent === "submit" ? timestamp : savingAnnotation.submittedAt ?? timestamp } : {}),
    };
    void database.current.saveAnnotation(persisted).then(() => {
      annotations.current.set(persisted.itemId, persisted);
      dispatch({ type: "SAVE_SUCCEEDED", annotation: persisted });
      const index = items.findIndex((item) => item.id === persisted.itemId);
      if (intent === "draft-exit") window.location.assign(`${projectBasePath}/${projectId}`);
      else if (intent === "previous" && index > 0) window.location.assign(`${projectBasePath}/${projectId}/annotate?item=${items[index - 1].id}`);
      else if (intent === "submit") {
        const next = items.slice(index + 1).find((item) => annotations.current.get(item.id)?.status !== "submitted")
          ?? items.find((item) => annotations.current.get(item.id)?.status !== "submitted");
        window.location.assign(next ? `${projectBasePath}/${projectId}/annotate?item=${next.id}` : `${projectBasePath}/${projectId}/review`);
      }
    }).catch((error: unknown) => dispatch({ type: "SAVE_FAILED", message: error instanceof Error ? error.message : "Save failed." }));
  }, [state.value === "saving" ? state.savingAnnotation : undefined, state.value === "saving" ? state.intent : undefined, items, projectId, projectBasePath]);

  if ((detail?.project.status === "HUMAN_FINALIZED" || detail?.project.status === "UNBLINDED") && finalization) return <main className="project-shell locked-finalization">
    <header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`${projectBasePath}/${projectId}`}>Back to Project</a></header>
    <span className="status-pill">{detail.project.status}</span><h1>Human validation finalized</h1>
    <p>The human-validation results for this project are locked. Production annotation controls are unavailable.</p>
    <dl><div><dt>Finalized</dt><dd>{new Date(finalization.finalizedAt).toLocaleString()}</dd></div><div><dt>Snapshot</dt><dd className="hash-value">{finalization.snapshotHash.slice(0, 8)}…</dd></div></dl>
    <div className="page-actions"><a className="primary-link" href={`${projectBasePath}/${projectId}/finalized`}>View Finalized Human Results</a><a className="secondary-link button-link" href={`${projectBasePath}/${projectId}`}>Back to Project</a></div>
  </main>;
  if (state.value === "loading" || !detail || !activeItemId) return <main className="loading-screen"><p>Opening blinded validation item…</p></main>;
  const item = items.find((candidate) => candidate.id === activeItemId)!;
  const position = items.findIndex((candidate) => candidate.id === activeItemId) + 1;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const leaf = item.categoryId ? airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === item.categoryId) : undefined;
  const taxonomyReference = leaf ? buildTaxonomyReferenceView(leaf, airBenchTaxonomy.conceptualLevel3Nodes) : undefined;
  return <AnnotationScreen dispatch={dispatch} item={item} pack={pack} position={position} projectName={detail.project.name} state={state} submittedCount={detail.progress.submitted} taxonomyReference={taxonomyReference} total={items.length} />;
}
