export const DATABASE_NAME = "safeflow-human-validator";
export const DATABASE_VERSION = 1;

export const STORE_NAMES = {
  projects: "projects",
  validationItems: "validationItems",
  annotations: "annotations",
  adjudicatedAnnotations: "adjudicatedAnnotations",
  judgeArtifacts: "judgeArtifacts",
  referenceArtifacts: "referenceArtifacts",
  benchmarkPacks: "benchmarkPacks",
  importRuns: "importRuns",
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export interface StoreDefinition {
  keyPath: string;
  indexes: ReadonlyArray<{ name: string; keyPath: string | string[]; unique?: boolean }>;
}

export const DATABASE_SCHEMA: Record<StoreName, StoreDefinition> = {
  projects: {
    keyPath: "id",
    indexes: [{ name: "by-status", keyPath: "status" }],
  },
  validationItems: {
    keyPath: "id",
    indexes: [
      { name: "by-project", keyPath: "projectId" },
      { name: "by-project-external-id", keyPath: ["projectId", "externalId"], unique: true },
    ],
  },
  annotations: {
    keyPath: "id",
    indexes: [
      { name: "by-item", keyPath: "itemId" },
      { name: "by-project", keyPath: "projectId" },
      { name: "by-item-validator", keyPath: ["itemId", "validatorId"], unique: true },
      { name: "by-status", keyPath: "status" },
    ],
  },
  adjudicatedAnnotations: {
    keyPath: "id",
    indexes: [
      { name: "by-item", keyPath: "itemId", unique: true },
      { name: "by-project", keyPath: "projectId" },
    ],
  },
  judgeArtifacts: {
    keyPath: "id",
    indexes: [
      { name: "by-item", keyPath: "itemId" },
      { name: "by-item-judge", keyPath: ["itemId", "judgeId"], unique: true },
    ],
  },
  referenceArtifacts: {
    keyPath: "id",
    indexes: [{ name: "by-item", keyPath: "itemId", unique: true }],
  },
  benchmarkPacks: {
    keyPath: "key",
    indexes: [{ name: "by-pack-id", keyPath: "pack.id" }],
  },
  importRuns: {
    keyPath: "id",
    indexes: [{ name: "by-project", keyPath: "projectId" }],
  },
};
