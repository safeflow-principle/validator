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
import type { ProjectArchiveRecords } from "../backup/types";
import type { TrainingAttempt, TrainingSession } from "../training/types";

type StoredBenchmarkPack = { key: string; pack: BenchmarkPack; installedAt: string };

function normalizeProject(value: Project | (Omit<Project, "status"> & { status: string })): Project {
  return { ...value, status: ["READY", "VALIDATING", "REVIEW", "HUMAN_COMPLETE"].includes(value.status) ? value.status as ProjectStatus : "READY" };
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
    const existing = await this.getAnnotation(value.id);
    if (existing && value.revision <= existing.revision) {
      throw new Error(`Annotation revision must increase beyond ${existing.revision}.`);
    }
    await this.putAnnotation(value);
    const [project, items, annotations] = await Promise.all([
      this.get<Project>(STORE_NAMES.projects, value.projectId).then((project) => project ? normalizeProject(project) : undefined),
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", value.projectId),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", value.projectId).then((values) => values.map(normalizeAnnotation).filter((annotation) => annotation.validatorId === value.validatorId)),
    ]);
    const progress = calculateHumanProgress(items, annotations);
    if (project) await this.putProject({ ...project, status: statusAfterAnnotation(progress), updatedAt: value.updatedAt });
    return progress;
  }

  async setProjectStatus(projectId: string, status: ProjectStatus) {
    const storedProject = await this.get<Project>(STORE_NAMES.projects, projectId);
    const project = storedProject ? normalizeProject(storedProject) : undefined;
    if (!project || project.status === "HUMAN_COMPLETE") return;
    await this.putProject({ ...project, status, updatedAt: new Date().toISOString() });
  }

  async deleteProject(projectId: string) {
    const [items, annotations, adjudicated, importRuns] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId),
      this.getAllByIndex<AdjudicatedAnnotation>(STORE_NAMES.adjudicatedAnnotations, "by-project", projectId),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", projectId),
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
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).delete(projectId);
    for (const item of items) transaction.objectStore(STORE_NAMES.validationItems).delete(item.id);
    for (const annotation of annotations) transaction.objectStore(STORE_NAMES.annotations).delete(annotation.id);
    for (const record of adjudicated) transaction.objectStore(STORE_NAMES.adjudicatedAnnotations).delete(record.id);
    for (const run of importRuns) transaction.objectStore(STORE_NAMES.importRuns).delete(run.id);
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
    const [items, annotations, importRuns, storedPack] = await Promise.all([
      this.getAllByIndex<ValidationItem>(STORE_NAMES.validationItems, "by-project", projectId).then(sortItemsBySourceOrder),
      this.getAllByIndex<Annotation>(STORE_NAMES.annotations, "by-project", projectId).then((values) => values.map(normalizeAnnotation)),
      this.getAllByIndex<ImportRun>(STORE_NAMES.importRuns, "by-project", projectId),
      this.get<StoredBenchmarkPack>(STORE_NAMES.benchmarkPacks, `${project.benchmarkPackId}@${project.benchmarkPackVersion}`),
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
    ];
    const transaction = this.db.transaction(stores, "readwrite");
    transaction.objectStore(STORE_NAMES.projects).add(value.project);
    for (const item of value.items) transaction.objectStore(STORE_NAMES.validationItems).add(item);
    for (const annotation of value.annotations) transaction.objectStore(STORE_NAMES.annotations).add(annotation);
    for (const artifact of value.judgeArtifacts) transaction.objectStore(STORE_NAMES.judgeArtifacts).add(artifact);
    for (const artifact of value.referenceArtifacts) transaction.objectStore(STORE_NAMES.referenceArtifacts).add(artifact);
    for (const run of value.importRuns) transaction.objectStore(STORE_NAMES.importRuns).add(run);
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
}

export function openSafeFlowDatabase(
  indexedDb: IDBFactory = globalThis.indexedDB,
  name = DATABASE_NAME,
): Promise<SafeFlowDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open local database"));
    request.onblocked = () => reject(new Error("Local database upgrade is blocked by another tab"));
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, definition] of Object.entries(DATABASE_SCHEMA)) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath: definition.keyPath });
        for (const index of definition.indexes) {
          store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false });
        }
      }
    };
    request.onsuccess = () => resolve(new BrowserSafeFlowDatabase(request.result));
  });
}
