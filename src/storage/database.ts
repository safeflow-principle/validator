import type {
  AdjudicatedAnnotation,
  Annotation,
  BenchmarkPack,
  BlindedValidationItem,
  ImportRun,
  JudgeArtifact,
  Project,
  ReferenceArtifact,
  ValidationItem,
} from "../core/types";
import { DATABASE_NAME, DATABASE_SCHEMA, DATABASE_VERSION, STORE_NAMES, type StoreName } from "./schema";

type StoredBenchmarkPack = { key: string; pack: BenchmarkPack; installedAt: string };

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
  getBlindedItem(id: string): Promise<BlindedValidationItem | undefined>;
  getAnnotation(id: string): Promise<Annotation | undefined>;
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

  putProject(value: Project) { return this.put(STORE_NAMES.projects, value); }
  putValidationItem(value: ValidationItem) { return this.put(STORE_NAMES.validationItems, value); }
  putAnnotation(value: Annotation) { return this.put(STORE_NAMES.annotations, value); }
  putAdjudicatedAnnotation(value: AdjudicatedAnnotation) { return this.put(STORE_NAMES.adjudicatedAnnotations, value); }
  putJudgeArtifact(value: JudgeArtifact) { return this.put(STORE_NAMES.judgeArtifacts, value); }
  putReferenceArtifact(value: ReferenceArtifact) { return this.put(STORE_NAMES.referenceArtifacts, value); }
  putImportRun(value: ImportRun) { return this.put(STORE_NAMES.importRuns, value); }

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
    return this.get<Annotation>(STORE_NAMES.annotations, id);
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
