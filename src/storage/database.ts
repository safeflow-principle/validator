import type {
  AdjudicatedAnnotation,
  Annotation,
  BenchmarkPack,
  BlindedValidationItem,
  HumanValidationProgress,
  ImportRun,
  JudgeArtifact,
  Project,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  ReferenceArtifact,
  ValidationItem,
} from "../core/types";
import { DATABASE_NAME, DATABASE_SCHEMA, DATABASE_VERSION, STORE_NAMES, type StoreName } from "./schema";
import type { LocalImportBundle } from "../import/buildBundle";
import { calculateHumanProgress, sortItemsBySourceOrder, statusAfterAnnotation } from "../projects/progress";
import { LOCAL_VALIDATOR_ID } from "../core/constants";
import type { ProjectArchiveRecords, ProjectAuditEvent } from "../backup/types";
import type { TrainingAttempt, TrainingSession } from "../training/types";
import { finalizationStateToken } from "../finalization/finalizeHumanValidation";
import { verifyHumanValidationFinalizationHash } from "../finalization/hashFinalization";
import { parseHumanValidationFinalization } from "../finalization/schema";
import type {
  HumanFinalizationSourceRecords,
  HumanValidationAuditEvent,
  HumanValidationFinalization,
  PreparedHumanValidationFinalization,
} from "../finalization/types";
import { judgeAnalysisStateToken } from "../analysis/createJudgeAnalysis";
import { verifyJudgeAnalysis } from "../analysis/hashJudgeAnalysis";
import { parseJudgeAnalysis } from "../analysis/schema";
import type { JudgeAnalysis, JudgeAnalysisSourceRecords, PreparedJudgeAnalysis } from "../analysis/types";
import { verifyJudgeAnalysisReport } from "../analysis/hashJudgeAnalysisReport";
import { parseJudgeAnalysisReport } from "../analysis/reportSchema";
import type { JudgeAnalysisReport, PreparedJudgeAnalysisReport } from "../analysis/reportTypes";
import { canonicalizeFinalizationPayload } from "../finalization/canonicalize";

type StoredBenchmarkPack = { key: string; pack: BenchmarkPack; installedAt: string };

function normalizeProject(value: Project | (Omit<Project, "status"> & { status: string })): Project {
  return {
    ...value,
    workspaceMode: value.workspaceMode === "CLOUD" ? "CLOUD" : "LOCAL",
    status: ["READY", "VALIDATING", "REVIEW", "HUMAN_COMPLETE", "HUMAN_FINALIZED", "UNBLINDED"].includes(value.status) ? value.status as ProjectStatus : "READY",
  };
}

function normalizeAnnotation(value: Annotation | (Omit<Annotation, "status" | "evidenceSpans"> & { status: string; evidenceSpans?: Annotation["evidenceSpans"]; finalizedAt?: string })): Annotation {
  const legacy = value as typeof value & { finalizedAt?: string };
  return {
    ...value,
    status: value.status === "finalized" ? "submitted" : value.status as Annotation["status"],
    evidenceSpans: Array.isArray(value.evidenceSpans) ? value.evidenceSpans : [],
    ...(legacy.finalizedAt && !("submittedAt" in value) ? { submittedAt: legacy.finalizedAt } : {}),
  } as Annotation;
}

export interface SafeFlowDatabase {
  close(): void;
  clearAll(): Promise<void>;
  putProject(value: Project): Promise<void>;
  putValidationItem(value: ValidationItem): Promise<void>;
  putAnnotation(value: Annotation): Promise<void>;
  putAdjudicatedAnnotation(value: AdjudicatedAnnotation): Promise<void>;
  putJudgeArtifact(value: JudgeArtifact): Promise<void>;
  putReferenceArtifact(value: ReferenceArtifact): Promise<void>;
  putBenchmarkPack(value: BenchmarkPack): Promise<void>;
  putImportRun(value: ImportRun): Promise<void>;
  importProjectBundle(value: LocalImportBundle): Promise<void>;
  listProjectSummaries(): Promise<ProjectSummary[]>;
  getProjectDetail(id: string): Promise<ProjectDetail | undefined>;
  getBlindedProjectItems(projectId: string): Promise<BlindedValidationItem[]>;
  getProjectAnnotations(projectId: string, validatorId?: string): Promise<Annotation[]>;
  saveAnnotation(value: Annotation): Promise<HumanValidationProgress>;
  setProjectStatus(projectId: string, status: ProjectStatus): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  getProjectArchive(projectId: string): Promise<ProjectArchiveRecords | undefined>;
  restoreProjectArchive(value: ProjectArchiveRecords): Promise<void>;
  getBlindedItem(id: string): Promise<BlindedValidationItem | undefined>;
  getAnnotation(id: string): Promise<Annotation | undefined>;
  putTrainingSession(value: TrainingSession): Promise<void>;
  getTrainingSession(id: string): Promise<TrainingSession | undefined>;
  listTrainingSessions(benchmarkId: string): Promise<TrainingSession[]>;
  getTrainingAttemptsBySession(sessionId: string): Promise<TrainingAttempt[]>;
  getTrainingAttemptsByBenchmark(benchmarkId: string): Promise<TrainingAttempt[]>;
  recordTrainingAttempt(attempt: TrainingAttempt, session: TrainingSession): Promise<void>;
  getHumanFinalizationSource(projectId: string): Promise<HumanFinalizationSourceRecords | undefined>;
  commitHumanValidationFinalization(value: PreparedHumanValidationFinalization): Promise<void>;
  getHumanValidationFinalization(id: string): Promise<HumanValidationFinalization | undefined>;
  getLatestHumanValidationFinalization(projectId: string): Promise<HumanValidationFinalization | undefined>;
  listHumanValidationFinalizations(projectId: string): Promise<HumanValidationFinalization[]>;
  getJudgeAnalysisSource(finalizationId: string): Promise<JudgeAnalysisSourceRecords | undefined>;
  commitJudgeAnalysis(value: PreparedJudgeAnalysis): Promise<void>;
  getJudgeAnalysis(id: string): Promise<JudgeAnalysis | undefined>;
  getJudgeAnalysisForFinalization(finalizationId: string): Promise<JudgeAnalysis | undefined>;
  listJudgeAnalyses(projectId: string): Promise<JudgeAnalysis[]>;
  commitJudgeAnalysisReport(value: PreparedJudgeAnalysisReport): Promise<void>;
  getJudgeAnalysisReport(id: string): Promise<JudgeAnalysisReport | undefined>;
  getJudgeAnalysisReportForAnalysis(analysisId: string, methodologyVersion: string): Promise<JudgeAnalysisReport | undefined>;
  listJudgeAnalysisReports(projectId: string): Promise<JudgeAnalysisReport[]>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

class BrowserSafeFlowDatabase implements SafeFlowDatabase {
  constructor(private readonly db: IDBDatabase) {}

  close() {
    this.db.close();
  }

  async clearAll() {
    const stores = Object.values(STORE_NAMES);
    const transaction = this.db.transaction(stores, "readwrite");
    for (const store of stores) transaction.objectStore(store).clear();
    await transactionDone(transaction);
  }

  private async put<T>(storeName: StoreName, value: T) {
    const transaction = this.db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }

  private async get<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    const transaction = this.db.transaction(storeName, "readonly");
    const value = await requestResult(transaction.objectStore(storeName).get(id));
    await transactionDone(transaction);
    return value as T | undefined;
  }

  private async getAll<T>(storeName: StoreName): Promise<T[]> {
    const transaction = this.db.transaction(storeName, "readonly");
    const values = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);
    return values as T[];
  }

  private async getAllByIndex<T>(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<T[]> {
    const transaction = this.db.transaction(storeName, "readonly");
    const values = await requestResult(transaction.objectStore(storeName).index(indexName).getAll(key));
    await transactionDone(transaction);
    return values as T[];
  }

  private async getAllKeysByIndex(storeName: StoreName, indexName: string, key: IDBValidKey): Promise<IDBValidKey[]> {
    const transaction = this.db.transaction(storeName, "readonly");
    const values = await requestResult(transaction.objectStore(storeName).index(indexName).getAllKeys(key));
    await transactionDone(transaction);
    return values;
  }

  putProject(value: Project) { return this.put(STORE_NAMES.projects, value); }
  putValidationItem(value: ValidationItem) { return this.put(STORE_NAMES.validationItems, value); }
  putAnnotation(value: Annotation) { return this.put(STORE_NAMES.annotations, value); }
  putAdjudicatedAnnotation(value: AdjudicatedAnnotation) { return this.put(STORE_NAMES.adjudicatedAnnotations, value); }
  putJudgeArtifact(value: JudgeArtifact) { return this.put(STORE_NAMES.judgeArtifacts, value); }
  putReferenceArtifact(value: ReferenceArtifact) { return this.put(STORE_NAMES.referenceArtifacts, value); }
  putImportRun(value: ImportRun) { return this.put(STORE_NAMES.importRuns, value); }

  async importProjectBundle(value: LocalImportBundle) {
    const stores = [
      STORE_NAMES.projects,
      STORE_NAMES.validationItems,
      STORE_NAMES.judgeArtifacts,
      STORE_NAMES.referenceArtifacts,
      STORE_NAMES.importRuns,
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).add(value.project);
    for (const item of value.items) transaction.objectStore(STORE_NAMES.validationItems).add(item);
    for (const artifact of value.judgeArtifacts) transaction.objectStore(STORE_NAMES.judgeArtifacts).add(artifact);
    for (const artifact of value.referenceArtifacts) transaction.objectStore(STORE_NAMES.referenceArtifacts).add(artifact);
    transaction.objectStore(STORE_NAMES.importRuns).add(value.importRun);
    await transactionDone(transaction);
  }

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const projects = (await this.getAll<Project>(STORE_NAMES.projects)).map(normalizeProject);
    const summaries = await Promise.all(projects.map(async (project) => {
      const [items, annotations, importRuns] = await Promise.all([
        this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", project.id),
        this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", project.id).then((values) => values.map(normalizeAnnotation).filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID)),
        this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", project.id),
      ]);
      const timestamps = [project.updatedAt, ...annotations.map((annotation) => annotation.updatedAt), ...importRuns.map((run) => run.createdAt)];
      return {
        project,
        sourceName: importRuns[0]?.sourceName ?? "Local dataset",
        lastActivityAt: timestamps.sort().at(-1) ?? project.updatedAt,
        progress: calculateHumanProgress(items, annotations),
      };
    }));
    return summaries.sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
  }

  async getProjectDetail(id: string): Promise<ProjectDetail | undefined> {
    const storedProject = await this.get<Project>(STORE_NAMES.projects, id);
    if (!storedProject) return undefined;
    const project = normalizeProject(storedProject);
    const [items, annotations, importRuns] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", id),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", id).then((values) => values.map(normalizeAnnotation).filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID)),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", id),
    ]);
    const importRun = importRuns[0];
    const timestamps = [project.updatedAt, ...annotations.map((annotation) => annotation.updatedAt), ...(importRun ? [importRun.createdAt] : [])];
    return {
      project,
      sourceName: importRun?.sourceName ?? "Local dataset",
      lastActivityAt: timestamps.sort().at(-1) ?? project.updatedAt,
      progress: calculateHumanProgress(items, annotations),
      ...(importRun ? { importRun } : {}),
    };
  }

  async getBlindedProjectItems(projectId: string): Promise<BlindedValidationItem[]> {
    const items = sortItemsBySourceOrder(await this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId));
    return items.map(({ id, projectId: itemProjectId, externalId, prompt, response, categoryId }) => ({
      id,
      projectId: itemProjectId,
      externalId,
      prompt,
      response,
      categoryId,
    }));
  }

  getProjectAnnotations(projectId: string, validatorId = LOCAL_VALIDATOR_ID) {
    return this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId)
      .then((values) => values.map(normalizeAnnotation).filter((annotation) => annotation.validatorId === validatorId));
  }

  async saveAnnotation(value: Annotation): Promise<HumanValidationProgress> {
    const transaction = this.db.transaction([STORE_NAMES.projects, STORE_NAMES.validationItems, STORE_NAMES.annotations], "readwrite");
    const done = transactionDone(transaction);
    try {
      const projectStore = transaction.objectStore(STORE_NAMES.projects);
      const itemStore = transaction.objectStore(STORE_NAMES.validationItems);
      const annotationStore = transaction.objectStore(STORE_NAMES.annotations);
      const [storedProject, existingValue, items, storedAnnotations] = await Promise.all([
        requestResult(projectStore.get(value.projectId)),
        requestResult(annotationStore.get(value.id)),
        requestResult(itemStore.index("by-project").getAll(value.projectId)),
        requestResult(annotationStore.index("by-project").getAll(value.projectId)),
      ]);
      if (!storedProject) throw new Error("Project not found.");
      const project = normalizeProject(storedProject as Project);
      if (project.status === "HUMAN_FINALIZED" || project.status === "UNBLINDED") throw new Error("Human validation has been finalized. These annotations are locked.");
      const existing = existingValue ? normalizeAnnotation(existingValue as Annotation) : undefined;
      if (existing && value.revision <= existing.revision) throw new Error(`Annotation revision must increase beyond ${existing.revision}.`);
      const versioned: Annotation = {
        ...value,
        benchmarkPackVersion: value.benchmarkPackVersion ?? project.benchmarkPackVersion,
        rubricVersion: value.rubricVersion ?? project.benchmarkPackVersion,
      };
      annotationStore.put(versioned);
      const annotations = (storedAnnotations as Annotation[])
        .map(normalizeAnnotation)
        .filter((annotation) => annotation.validatorId === value.validatorId && annotation.id !== value.id)
        .concat(versioned);
      const progress = calculateHumanProgress(items as ValidationItem[], annotations);
      projectStore.put({ ...project, status: statusAfterAnnotation(progress), updatedAt: value.updatedAt });
      await done;
      return progress;
    } catch (error) {
      try { transaction.abort(); } catch { /* Transaction may already be inactive. */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  async setProjectStatus(projectId: string, status: ProjectStatus) {
    const storedProject = await this.get<Project>(STORE_NAMES.projects, projectId);
    const project = storedProject ? normalizeProject(storedProject) : undefined;
    if (!project || project.status === "HUMAN_COMPLETE" || project.status === "HUMAN_FINALIZED" || project.status === "UNBLINDED") return;
    await this.putProject({ ...project, status, updatedAt: new Date().toISOString() });
  }

  async deleteProject(projectId: string) {
    const [items, annotations, adjudicated, importRuns, finalizations, judgeAnalyses, judgeAnalysisReports, auditEvents] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId),
      this.getAllByIndex<AdjudicatedAnnotation>(STORE_NAMES.adjudicatedAnnotations, "by-project", projectId),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", projectId),
      this.getAllByIndex<HumanValidationFinalization>(STORE_NAMES.humanValidationFinalizations, "by-project", projectId),
      this.getAllByIndex<JudgeAnalysis>(STORE_NAMES.judgeAnalyses, "by-project", projectId),
      this.getAllByIndex<JudgeAnalysisReport>(STORE_NAMES.judgeAnalysisReports, "by-project", projectId),
      this.getAllByIndex<ProjectAuditEvent>(STORE_NAMES.auditEvents, "by-project", projectId),
    ]);
    const artifactKeys = await Promise.all(items.map(async (item) => ({
      judge: await this.getAllKeysByIndex(STORE_NAMES.judgeArtifacts, "by-item", item.id),
      reference: await this.getAllKeysByIndex(STORE_NAMES.referenceArtifacts, "by-item", item.id),
    })));
    const stores = [
      STORE_NAMES.projects,
      STORE_NAMES.validationItems,
      STORE_NAMES.annotations,
      STORE_NAMES.adjudicatedAnnotations,
      STORE_NAMES.judgeArtifacts,
      STORE_NAMES.referenceArtifacts,
      STORE_NAMES.importRuns,
      STORE_NAMES.humanValidationFinalizations,
      STORE_NAMES.judgeAnalyses,
      STORE_NAMES.judgeAnalysisReports,
      STORE_NAMES.auditEvents,
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).delete(projectId);
    for (const item of items) transaction.objectStore(STORE_NAMES.validationItems).delete(item.id);
    for (const annotation of annotations) transaction.objectStore(STORE_NAMES.annotations).delete(annotation.id);
    for (const record of adjudicated) transaction.objectStore(STORE_NAMES.adjudicatedAnnotations).delete(record.id);
    for (const run of importRuns) transaction.objectStore(STORE_NAMES.importRuns).delete(run.id);
    for (const finalization of finalizations) transaction.objectStore(STORE_NAMES.humanValidationFinalizations).delete(finalization.id);
    for (const analysis of judgeAnalyses) transaction.objectStore(STORE_NAMES.judgeAnalyses).delete(analysis.id);
    for (const report of judgeAnalysisReports) transaction.objectStore(STORE_NAMES.judgeAnalysisReports).delete(report.id);
    for (const event of auditEvents) transaction.objectStore(STORE_NAMES.auditEvents).delete(event.id);
    for (const keys of artifactKeys) {
      for (const key of keys.judge) transaction.objectStore(STORE_NAMES.judgeArtifacts).delete(key);
      for (const key of keys.reference) transaction.objectStore(STORE_NAMES.referenceArtifacts).delete(key);
    }
    await transactionDone(transaction);
  }

  async getProjectArchive(projectId: string): Promise<ProjectArchiveRecords | undefined> {
    const storedProject = await this.get<Project>(STORE_NAMES.projects, projectId);
    if (!storedProject) return undefined;
    const project = normalizeProject(storedProject);
    const [items, annotations, importRuns, storedPack, humanValidationFinalizations, judgeAnalyses, judgeAnalysisReports, auditEvents] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId).then(sortItemsBySourceOrder),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId).then((values) => values.map(normalizeAnnotation)),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", projectId),
      this.get<StoredBenchmarkPack>(STORE_NAMES.benchmarkPacks, `${project.benchmarkPackId}@${project.benchmarkPackVersion}`),
      this.getAllByIndex<HumanValidationFinalization>(STORE_NAMES.humanValidationFinalizations, "by-project", projectId),
      this.getAllByIndex<JudgeAnalysis>(STORE_NAMES.judgeAnalyses, "by-project", projectId),
      this.getAllByIndex<JudgeAnalysisReport>(STORE_NAMES.judgeAnalysisReports, "by-project", projectId),
      this.getAllByIndex<ProjectAuditEvent>(STORE_NAMES.auditEvents, "by-project", projectId),
    ]);
    if (!storedPack) throw new Error(`Benchmark pack ${project.benchmarkPackId}@${project.benchmarkPackVersion} is unavailable locally.`);
    const artifacts = await Promise.all(items.map(async (item) => Promise.all([
      this.getAllByIndex<JudgeArtifact>(STORE_NAMES.judgeArtifacts, "by-item", item.id),
      this.getAllByIndex<ReferenceArtifact>(STORE_NAMES.referenceArtifacts, "by-item", item.id),
    ])));
    return {
      project,
      items,
      annotations,
      importRuns,
      benchmarkPack: structuredClone(storedPack.pack),
      judgeArtifacts: artifacts.flatMap(([judges]) => judges),
      referenceArtifacts: artifacts.flatMap(([, references]) => references),
      humanValidationFinalizations,
      judgeAnalyses,
      judgeAnalysisReports,
      auditEvents,
    };
  }

  async restoreProjectArchive(value: ProjectArchiveRecords): Promise<void> {
    if (await this.get<Project>(STORE_NAMES.projects, value.project.id)) {
      throw new Error(`A local project with ID ${value.project.id} already exists.`);
    }
    const stores = [
      STORE_NAMES.projects,
      STORE_NAMES.validationItems,
      STORE_NAMES.annotations,
      STORE_NAMES.judgeArtifacts,
      STORE_NAMES.referenceArtifacts,
      STORE_NAMES.benchmarkPacks,
      STORE_NAMES.importRuns,
      STORE_NAMES.humanValidationFinalizations,
      STORE_NAMES.judgeAnalyses,
      STORE_NAMES.judgeAnalysisReports,
      STORE_NAMES.auditEvents,
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).add(value.project);
    for (const item of value.items) transaction.objectStore(STORE_NAMES.validationItems).add(item);
    for (const annotation of value.annotations) transaction.objectStore(STORE_NAMES.annotations).add({
      ...annotation,
      benchmarkPackVersion: annotation.benchmarkPackVersion ?? value.project.benchmarkPackVersion,
      rubricVersion: annotation.rubricVersion ?? value.benchmarkPack.version,
    });
    for (const artifact of value.judgeArtifacts) transaction.objectStore(STORE_NAMES.judgeArtifacts).add(artifact);
    for (const artifact of value.referenceArtifacts) transaction.objectStore(STORE_NAMES.referenceArtifacts).add(artifact);
    for (const run of value.importRuns) transaction.objectStore(STORE_NAMES.importRuns).add(run);
    for (const finalization of value.humanValidationFinalizations) transaction.objectStore(STORE_NAMES.humanValidationFinalizations).add(finalization);
    for (const analysis of value.judgeAnalyses) transaction.objectStore(STORE_NAMES.judgeAnalyses).add(analysis);
    for (const report of value.judgeAnalysisReports) transaction.objectStore(STORE_NAMES.judgeAnalysisReports).add(report);
    for (const event of value.auditEvents) transaction.objectStore(STORE_NAMES.auditEvents).add(event);
    transaction.objectStore(STORE_NAMES.benchmarkPacks).put({
      key: `${value.benchmarkPack.id}@${value.benchmarkPack.version}`,
      pack: value.benchmarkPack,
      installedAt: new Date().toISOString(),
    } satisfies StoredBenchmarkPack);
    await transactionDone(transaction);
  }

  putBenchmarkPack(value: BenchmarkPack) {
    const stored: StoredBenchmarkPack = {
      key: `${value.id}@${value.version}`,
      pack: value,
      installedAt: new Date().toISOString(),
    };
    return this.put(STORE_NAMES.benchmarkPacks, stored);
  }

  async getBlindedItem(id: string): Promise<BlindedValidationItem | undefined> {
    const item = await this.get<ValidationItem>(STORE_NAMES.validationItems, id);
    if (!item) return undefined;
    const { projectId, externalId, prompt, response, categoryId } = item;
    return { id: item.id, projectId, externalId, prompt, response, categoryId };
  }

  getAnnotation(id: string) {
    return this.get<Annotation>(STORE_NAMES.annotations, id).then((annotation) => annotation ? normalizeAnnotation(annotation) : undefined);
  }

  putTrainingSession(value: TrainingSession) { return this.put(STORE_NAMES.trainingSessions, value); }
  getTrainingSession(id: string) { return this.get<TrainingSession>(STORE_NAMES.trainingSessions, id); }
  listTrainingSessions(benchmarkId: string) {
    return this.getAllByIndex<TrainingSession>(STORE_NAMES.trainingSessions, "by-benchmark", benchmarkId)
      .then((sessions) => sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }
  getTrainingAttemptsBySession(sessionId: string) {
    return this.getAllByIndex<TrainingAttempt>(STORE_NAMES.trainingAttempts, "by-session", sessionId)
      .then((attempts) => attempts.sort((left, right) => left.completedAt.localeCompare(right.completedAt)));
  }
  getTrainingAttemptsByBenchmark(benchmarkId: string) {
    return this.getAllByIndex<TrainingAttempt>(STORE_NAMES.trainingAttempts, "by-benchmark", benchmarkId)
      .then((attempts) => attempts.sort((left, right) => left.completedAt.localeCompare(right.completedAt)));
  }
  async recordTrainingAttempt(attempt: TrainingAttempt, session: TrainingSession) {
    const transaction = this.db.transaction([STORE_NAMES.trainingAttempts, STORE_NAMES.trainingSessions], "readwrite");
    transaction.objectStore(STORE_NAMES.trainingAttempts).add(attempt);
    transaction.objectStore(STORE_NAMES.trainingSessions).put(session);
    await transactionDone(transaction);
  }

  async getHumanFinalizationSource(projectId: string): Promise<HumanFinalizationSourceRecords | undefined> {
    const storedProject = await this.get<Project>(STORE_NAMES.projects, projectId);
    if (!storedProject) return undefined;
    const project = normalizeProject(storedProject);
    const [items, annotations, importRuns, storedPack] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId).then(sortItemsBySourceOrder),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId).then((values) => values.map(normalizeAnnotation)),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", projectId),
      this.get<StoredBenchmarkPack>(STORE_NAMES.benchmarkPacks, `${project.benchmarkPackId}@${project.benchmarkPackVersion}`),
    ]);
    if (!storedPack) throw new Error(`Benchmark pack ${project.benchmarkPackId}@${project.benchmarkPackVersion} is unavailable locally.`);
    return { project, items, annotations, importRuns, benchmarkPack: structuredClone(storedPack.pack) };
  }

  async commitHumanValidationFinalization(prepared: PreparedHumanValidationFinalization): Promise<void> {
    const finalization = parseHumanValidationFinalization(prepared.finalization);
    if (!await verifyHumanValidationFinalizationHash(finalization)) throw new Error("Human-validation finalization integrity check failed before commit.");
    const stores = [
      STORE_NAMES.projects,
      STORE_NAMES.validationItems,
      STORE_NAMES.annotations,
      STORE_NAMES.importRuns,
      STORE_NAMES.benchmarkPacks,
      STORE_NAMES.humanValidationFinalizations,
      STORE_NAMES.auditEvents,
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    const done = transactionDone(transaction);
    try {
      const projectRequest = transaction.objectStore(STORE_NAMES.projects).get(finalization.projectId);
      const itemRequest = transaction.objectStore(STORE_NAMES.validationItems).index("by-project").getAll(finalization.projectId);
      const annotationRequest = transaction.objectStore(STORE_NAMES.annotations).index("by-project").getAll(finalization.projectId);
      const importRequest = transaction.objectStore(STORE_NAMES.importRuns).index("by-project").getAll(finalization.projectId);
      const packRequest = transaction.objectStore(STORE_NAMES.benchmarkPacks).get(`${prepared.expectedState.benchmarkPackId}@${prepared.expectedState.benchmarkPackVersion}`);
      const existingRequest = transaction.objectStore(STORE_NAMES.humanValidationFinalizations).index("by-project").getAll(finalization.projectId);
      const [projectValue, itemsValue, annotationsValue, importRunsValue, packValue, existingValue] = await Promise.all([
        requestResult(projectRequest), requestResult(itemRequest), requestResult(annotationRequest), requestResult(importRequest), requestResult(packRequest), requestResult(existingRequest),
      ]);
      if (!projectValue) throw new Error("Project not found.");
      const project = normalizeProject(projectValue as Project);
      if (project.status === "HUMAN_FINALIZED" || (existingValue as HumanValidationFinalization[]).length) {
        throw new Error("Human validation has already been finalized for this project.");
      }
      const currentSource: HumanFinalizationSourceRecords = {
        project,
        items: sortItemsBySourceOrder(itemsValue as ValidationItem[]),
        annotations: (annotationsValue as Annotation[]).map(normalizeAnnotation),
        importRuns: importRunsValue as ImportRun[],
        benchmarkPack: (packValue as StoredBenchmarkPack | undefined)?.pack as BenchmarkPack,
      };
      if (!currentSource.benchmarkPack || JSON.stringify(finalizationStateToken(currentSource)) !== JSON.stringify(prepared.expectedState)) {
        throw new Error("One or more annotations changed while finalization was being prepared. Review the latest annotations and try again.");
      }
      transaction.objectStore(STORE_NAMES.humanValidationFinalizations).add(finalization);
      transaction.objectStore(STORE_NAMES.projects).put({ ...project, status: "HUMAN_FINALIZED", updatedAt: finalization.finalizedAt });
      transaction.objectStore(STORE_NAMES.auditEvents).add(prepared.auditEvent);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* Transaction may already be inactive. */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  getHumanValidationFinalization(id: string) {
    return this.get<HumanValidationFinalization>(STORE_NAMES.humanValidationFinalizations, id)
      .then((value) => value ? parseHumanValidationFinalization(value) : undefined);
  }

  listHumanValidationFinalizations(projectId: string) {
    return this.getAllByIndex<HumanValidationFinalization>(STORE_NAMES.humanValidationFinalizations, "by-project", projectId)
      .then((values) => values.map(parseHumanValidationFinalization).sort((left, right) => left.finalizationSequence - right.finalizationSequence));
  }

  getLatestHumanValidationFinalization(projectId: string) {
    return this.listHumanValidationFinalizations(projectId).then((values) => values.at(-1));
  }

  async getJudgeAnalysisSource(finalizationId: string): Promise<JudgeAnalysisSourceRecords | undefined> {
    const finalization = await this.getHumanValidationFinalization(finalizationId);
    if (!finalization) return undefined;
    const project = await this.get<Project>(STORE_NAMES.projects, finalization.projectId).then((value) => value ? normalizeProject(value) : undefined);
    if (!project) throw new Error("Project for human finalization was not found.");
    const judgeArtifacts = (await Promise.all(finalization.annotations.map((annotation) =>
      this.getAllByIndex<JudgeArtifact>(STORE_NAMES.judgeArtifacts, "by-item", annotation.itemId),
    ))).flat();
    return { project, finalization, judgeArtifacts };
  }

  async commitJudgeAnalysis(prepared: PreparedJudgeAnalysis): Promise<void> {
    const analysis = parseJudgeAnalysis(prepared.analysis);
    if (!await verifyJudgeAnalysis(analysis)) throw new Error("Judge-analysis integrity check failed before commit.");
    const stores = [STORE_NAMES.projects, STORE_NAMES.humanValidationFinalizations, STORE_NAMES.judgeArtifacts, STORE_NAMES.judgeAnalyses, STORE_NAMES.auditEvents];
    const transaction = this.db.transaction(stores, "readwrite");
    const done = transactionDone(transaction);
    try {
      const artifactRequests = [...new Set(analysis.judgeArtifacts.map((artifact) => artifact.itemId))]
        .map((itemId) => transaction.objectStore(STORE_NAMES.judgeArtifacts).index("by-item").getAll(itemId));
      const [projectValue, finalizationValue, existingValue, ...artifactGroups] = await Promise.all([
        requestResult(transaction.objectStore(STORE_NAMES.projects).get(analysis.projectId)),
        requestResult(transaction.objectStore(STORE_NAMES.humanValidationFinalizations).get(analysis.finalizationId)),
        requestResult(transaction.objectStore(STORE_NAMES.judgeAnalyses).index("by-finalization").get(analysis.finalizationId)),
        ...artifactRequests.map(requestResult),
      ]);
      if (!projectValue || !finalizationValue) throw new Error("Project or human finalization was not found.");
      if (existingValue) throw new Error("This human finalization has already been unblinded.");
      const project = normalizeProject(projectValue as Project);
      if (project.status !== "HUMAN_FINALIZED") throw new Error("Project is no longer eligible for unblinding.");
      const finalization = parseHumanValidationFinalization(finalizationValue);
      const currentSource: JudgeAnalysisSourceRecords = {
        project, finalization,
        judgeArtifacts: (artifactGroups as JudgeArtifact[][]).flat(),
      };
      if (JSON.stringify(judgeAnalysisStateToken(currentSource, analysis.judgeId)) !== JSON.stringify(prepared.expectedState)) {
        throw new Error("The human finalization or judge artifacts changed while comparison was being prepared. Try again.");
      }
      transaction.objectStore(STORE_NAMES.judgeAnalyses).add(analysis);
      transaction.objectStore(STORE_NAMES.projects).put({ ...project, status: "UNBLINDED", updatedAt: analysis.createdAt });
      transaction.objectStore(STORE_NAMES.auditEvents).add(prepared.auditEvent);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* Transaction may already be inactive. */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  getJudgeAnalysis(id: string) {
    return this.get<JudgeAnalysis>(STORE_NAMES.judgeAnalyses, id).then((value) => value ? parseJudgeAnalysis(value) : undefined);
  }

  getJudgeAnalysisForFinalization(finalizationId: string) {
    return this.getAllByIndex<JudgeAnalysis>(STORE_NAMES.judgeAnalyses, "by-finalization", finalizationId).then((values) => values[0] ? parseJudgeAnalysis(values[0]) : undefined);
  }

  listJudgeAnalyses(projectId: string) {
    return this.getAllByIndex<JudgeAnalysis>(STORE_NAMES.judgeAnalyses, "by-project", projectId)
      .then((values) => values.map(parseJudgeAnalysis).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
  }

  async commitJudgeAnalysisReport(prepared: PreparedJudgeAnalysisReport): Promise<void> {
    const report = parseJudgeAnalysisReport(prepared.report);
    if (!await verifyJudgeAnalysisReport(report)) throw new Error("Judge-analysis report integrity check failed before commit.");
    const stores = [STORE_NAMES.humanValidationFinalizations, STORE_NAMES.judgeAnalyses, STORE_NAMES.judgeAnalysisReports, STORE_NAMES.auditEvents];
    const transaction = this.db.transaction(stores, "readwrite");
    const done = transactionDone(transaction);
    try {
      const [finalizationValue, analysisValue, existingValue] = await Promise.all([
        requestResult(transaction.objectStore(STORE_NAMES.humanValidationFinalizations).get(report.finalizationId)),
        requestResult(transaction.objectStore(STORE_NAMES.judgeAnalyses).get(report.analysisId)),
        requestResult(transaction.objectStore(STORE_NAMES.judgeAnalysisReports).index("by-analysis-methodology").get([report.analysisId, report.methodology.version])),
      ]);
      if (!finalizationValue || !analysisValue) throw new Error("Linked human finalization or judge analysis was not found.");
      if (existingValue) throw new Error(`A ${report.methodology.version} report already exists for this judge analysis.`);
      const finalization = parseHumanValidationFinalization(finalizationValue);
      const analysis = parseJudgeAnalysis(analysisValue);
      if (canonicalizeFinalizationPayload(finalization) !== prepared.expectedFinalizationState || canonicalizeFinalizationPayload(analysis) !== prepared.expectedAnalysisState || finalization.snapshotHash !== report.finalizationHash || analysis.analysisHash !== report.analysisHash || analysis.finalizationId !== finalization.id) {
        throw new Error("The immutable analysis inputs do not match the prepared report.");
      }
      transaction.objectStore(STORE_NAMES.judgeAnalysisReports).add(report);
      transaction.objectStore(STORE_NAMES.auditEvents).add(prepared.auditEvent);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* Transaction may already be inactive. */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  getJudgeAnalysisReport(id: string) {
    return this.get<JudgeAnalysisReport>(STORE_NAMES.judgeAnalysisReports, id).then((value) => value ? parseJudgeAnalysisReport(value) : undefined);
  }

  getJudgeAnalysisReportForAnalysis(analysisId: string, methodologyVersion: string) {
    return this.getAllByIndex<JudgeAnalysisReport>(STORE_NAMES.judgeAnalysisReports, "by-analysis-methodology", [analysisId, methodologyVersion])
      .then((values) => values[0] ? parseJudgeAnalysisReport(values[0]) : undefined);
  }

  listJudgeAnalysisReports(projectId: string) {
    return this.getAllByIndex<JudgeAnalysisReport>(STORE_NAMES.judgeAnalysisReports, "by-project", projectId)
      .then((values) => values.map(parseJudgeAnalysisReport).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
  }
}

export function openSafeFlowDatabase(
  indexedDb: IDBFactory = globalThis.indexedDB,
  name = DATABASE_NAME,
): Promise<SafeFlowDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open local database"));
    request.onblocked = () => reject(new Error("Local database upgrade is blocked by another tab"));
    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (const [storeName, definition] of Object.entries(DATABASE_SCHEMA)) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath: definition.keyPath });
        for (const index of definition.indexes) {
          store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false });
        }
      }
      if (event.oldVersion < 3 && db.objectStoreNames.contains(STORE_NAMES.annotations)) {
        const transaction = request.transaction!;
        const annotations = transaction.objectStore(STORE_NAMES.annotations);
        const projects = transaction.objectStore(STORE_NAMES.projects);
        const cursorRequest = annotations.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const annotation = cursor.value as Annotation;
          if (annotation.benchmarkPackVersion && annotation.rubricVersion) {
            cursor.continue();
            return;
          }
          const projectRequest = projects.get(annotation.projectId);
          projectRequest.onsuccess = () => {
            const project = projectRequest.result as Project | undefined;
            if (project) cursor.update({ ...annotation, benchmarkPackVersion: project.benchmarkPackVersion, rubricVersion: project.benchmarkPackVersion });
            cursor.continue();
          };
          projectRequest.onerror = () => cursor.continue();
        };
      }
      if (event.oldVersion < 6 && db.objectStoreNames.contains(STORE_NAMES.projects)) {
        const projects = request.transaction!.objectStore(STORE_NAMES.projects);
        const cursorRequest = projects.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const project = cursor.value as Partial<Project>;
          if (!project.workspaceMode) cursor.update({ ...project, workspaceMode: "LOCAL" });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(new BrowserSafeFlowDatabase(request.result));
  });
}
