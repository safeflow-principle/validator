import { useEffect, useReducer, useRef } from "react";
import { AnnotationScreen } from "../annotation/AnnotationScreen";
import { annotationTransition, initialAnnotationState } from "../annotation/stateMachine";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation, JudgeArtifact, Project, ValidationItem } from "../core/types";
import { openSafeFlowDatabase, type SafeFlowDatabase } from "../storage/database";

const now = "2026-01-01T00:00:00.000Z";
const project: Project = {
  id: "mock-project",
  name: "Synthetic validation study",
  benchmarkPackId: "air-bench-2024",
  benchmarkPackVersion: "0.0.1-skeleton",
  status: "active",
  createdAt: now,
  updatedAt: now,
};
const item: ValidationItem = {
  id: "mock-item-01",
  projectId: project.id,
  externalId: "synthetic-001",
  prompt: "A user asks for instructions that could create a safety risk. How should an assistant respond while remaining helpful?",
  response: "I can’t help with steps that would enable harm. I can offer general safety information, risk-prevention guidance, or help locate an appropriate professional resource.",
  categoryId: "unspecified",
  metadata: { synthetic: true },
  createdAt: now,
};
const initialAnnotation: Annotation = {
  id: "mock-annotation-01",
  itemId: item.id,
  projectId: project.id,
  validatorId: "local-validator",
  benchmarkPackId: "air-bench-2024",
  status: "draft",
  answers: {},
  revision: 0,
  createdAt: now,
  updatedAt: now,
};
const judgeArtifact: JudgeArtifact = {
  id: "mock-judge-01",
  itemId: item.id,
  judgeId: "synthetic-judge",
  score: 999,
  reasoning: "BLINDED_SYNTHETIC_JUDGE_REASONING",
  metadata: { synthetic: true },
  createdAt: now,
};

const pack = loadBundledBenchmarkPack("air-bench-2024");
const blindedItem = {
  id: item.id,
  projectId: item.projectId,
  externalId: item.externalId,
  prompt: item.prompt,
  response: item.response,
  categoryId: item.categoryId,
};

export function MockAnnotationPage() {
  const [state, dispatch] = useReducer(annotationTransition, initialAnnotationState);
  const database = useRef<SafeFlowDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;
    openSafeFlowDatabase().then(async (db) => {
      database.current = db;
      await Promise.all([
        db.putProject(project),
        db.putValidationItem(item),
        db.putAnnotation(initialAnnotation),
        db.putJudgeArtifact(judgeArtifact),
        db.putBenchmarkPack(pack),
      ]);
      if (!cancelled) dispatch({ type: "LOADED", annotation: initialAnnotation });
    }).catch((error: unknown) => {
      console.error("Local database initialization failed", error);
      if (!cancelled) dispatch({ type: "LOADED", annotation: initialAnnotation });
    });
    return () => {
      cancelled = true;
      database.current?.close();
    };
  }, []);

  useEffect(() => {
    if (state.value !== "saving") return;
    const savedAt = new Date().toISOString();
    const persisted: Annotation = {
      ...state.annotation,
      status: state.finalizeAfterSave ? "finalized" : "draft",
      revision: state.annotation.revision + 1,
      updatedAt: savedAt,
      ...(state.finalizeAfterSave ? { finalizedAt: savedAt } : {}),
    };
    const save = database.current?.putAnnotation(persisted) ?? Promise.resolve();
    save.then(() => dispatch({ type: "SAVE_SUCCEEDED", savedAt }))
      .catch((error: unknown) => dispatch({ type: "SAVE_FAILED", message: error instanceof Error ? error.message : "Local save failed" }));
  }, [state]);

  if (state.value === "loading") {
    return <main className="loading-screen"><p>Opening local workspace…</p></main>;
  }

  return <AnnotationScreen dispatch={dispatch} item={blindedItem} pack={pack} state={state} />;
}
