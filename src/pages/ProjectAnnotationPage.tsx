import { useEffect, useReducer, useRef, useState } from "react";
import { AnnotationScreen } from "../annotation/AnnotationScreen";
import { annotationTransition, initialAnnotationState } from "../annotation/stateMachine";
import { airBenchTaxonomy } from "../benchmarks/airBenchAssets";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { buildTaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import type { Annotation, BlindedValidationItem, ProjectDetail } from "../core/types";
import { findResumeItemId } from "../projects/progress";
import { openSafeFlowDatabase, type SafeFlowDatabase } from "../storage/database";
import { LOCAL_VALIDATOR_ID } from "../core/constants";

export function ProjectAnnotationPage({ projectId }: { projectId: string }) {
  const [state, dispatch] = useReducer(annotationTransition, initialAnnotationState);
  const [items, setItems] = useState<BlindedValidationItem[]>([]);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [activeItemId, setActiveItemId] = useState<string>();
  const annotations = useRef(new Map<string, Annotation>());
  const database = useRef<SafeFlowDatabase | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void openSafeFlowDatabase().then(async (db) => {
      database.current = db;
      const [projectDetail, projectItems, projectAnnotations] = await Promise.all([
        db.getProjectDetail(projectId), db.getBlindedProjectItems(projectId), db.getProjectAnnotations(projectId),
      ]);
      if (!projectDetail) throw new Error("Project not found.");
      annotations.current = new Map(projectAnnotations.map((annotation) => [annotation.itemId, annotation]));
      const requested = new URLSearchParams(window.location.search).get("item");
      const itemId = requested && projectItems.some((item) => item.id === requested)
        ? requested
        : findResumeItemId(projectItems, projectAnnotations);
      if (!itemId) {
        window.location.replace(`/projects/${projectId}/review`);
        return;
      }
      const now = new Date().toISOString();
      const annotation = annotations.current.get(itemId) ?? {
        id: `${itemId}:${LOCAL_VALIDATOR_ID}`,
        itemId,
        projectId,
        validatorId: LOCAL_VALIDATOR_ID,
        benchmarkPackId: projectDetail.project.benchmarkPackId,
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
    }).catch(() => { if (!cancelled) window.location.replace(`/projects/${projectId}`); });
    return () => { cancelled = true; database.current?.close(); };
  }, [projectId]);

  useEffect(() => {
    if (state.value !== "editing" || !state.dirty) return;
    const timer = window.setTimeout(() => dispatch({ type: "SAVE_REQUESTED", intent: "autosave" }), 500);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state.value !== "saving" || !database.current) return;
    const intent = state.intent;
    const timestamp = new Date().toISOString();
    const submitted = intent === "submit" || state.annotation.status === "submitted";
    const persisted: Annotation = {
      ...state.annotation,
      status: submitted ? "submitted" : "draft",
      revision: state.annotation.revision + 1,
      updatedAt: timestamp,
      ...(submitted ? { submittedAt: intent === "submit" ? timestamp : state.annotation.submittedAt ?? timestamp } : {}),
    };
    void database.current.saveAnnotation(persisted).then(() => {
      annotations.current.set(persisted.itemId, persisted);
      dispatch({ type: "SAVE_SUCCEEDED", annotation: persisted });
      const index = items.findIndex((item) => item.id === persisted.itemId);
      if (intent === "draft-exit") window.location.assign(`/projects/${projectId}`);
      else if (intent === "previous" && index > 0) window.location.assign(`/projects/${projectId}/annotate?item=${items[index - 1].id}`);
      else if (intent === "submit") {
        const next = items.slice(index + 1).find((item) => annotations.current.get(item.id)?.status !== "submitted")
          ?? items.find((item) => annotations.current.get(item.id)?.status !== "submitted");
        window.location.assign(next ? `/projects/${projectId}/annotate?item=${next.id}` : `/projects/${projectId}/review`);
      }
    }).catch((error: unknown) => dispatch({ type: "SAVE_FAILED", message: error instanceof Error ? error.message : "Local save failed." }));
  }, [state, items, projectId]);

  if (state.value === "loading" || !detail || !activeItemId) return <main className="loading-screen"><p>Opening blinded validation item…</p></main>;
  const item = items.find((candidate) => candidate.id === activeItemId)!;
  const position = items.findIndex((candidate) => candidate.id === activeItemId) + 1;
  const pack = loadBundledBenchmarkPack(detail.project.benchmarkPackId);
  const leaf = item.categoryId ? airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === item.categoryId) : undefined;
  const taxonomyReference = leaf ? buildTaxonomyReferenceView(leaf, airBenchTaxonomy.conceptualLevel3Nodes) : undefined;
  return <AnnotationScreen dispatch={dispatch} item={item} pack={pack} position={position} projectName={detail.project.name} state={state} submittedCount={detail.progress.submitted} taxonomyReference={taxonomyReference} total={items.length} />;
}
