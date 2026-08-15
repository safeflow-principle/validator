import { LOCAL_VALIDATOR_ID } from "../core/constants";
import type { AnnotationValue, BenchmarkCategory, ValidationItem } from "../core/types";
import { sortItemsBySourceOrder } from "../projects/progress";
import type { SafeFlowDatabase } from "../storage/database";
import { evaluateHumanFinalizationEligibility } from "./eligibility";
import { canonicalizeFinalizationPayload } from "./canonicalize";
import { hashFinalizationPayload } from "./hashFinalization";
import {
  HUMAN_FINALIZATION_SCHEMA_VERSION,
  type FinalizedConfidence,
  type FinalizedTaxonomyPath,
  type HumanFinalizationSourceRecords,
  type HumanValidationAuditEvent,
  type HumanValidationFinalization,
  type PreparedHumanValidationFinalization,
} from "./types";

export class HumanFinalizationValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(details.join(" "));
    this.name = "HumanFinalizationValidationError";
  }
}

function stringMetadata(item: ValidationItem, key: string): string | undefined {
  const value = item.metadata[key];
  return typeof value === "string" && value ? value : undefined;
}

function taxonomyPath(category: BenchmarkCategory | undefined): FinalizedTaxonomyPath | undefined {
  const path = category?.description?.text?.split(" > ").map((part) => part.trim()).filter(Boolean);
  if (!path?.length) return undefined;
  return { ...(path[0] ? { level1: path[0] } : {}), ...(path[1] ? { level2: path[1] } : {}), ...(path[2] ? { level3: path[2] } : {}), ...(path[3] ? { level4: path[3] } : {}) };
}

function confidence(value: AnnotationValue | undefined): FinalizedConfidence {
  if (value === "High") return "high";
  if (value === "Medium") return "medium";
  if (value === "Low") return "low";
  throw new Error("Invalid confidence reached finalization construction.");
}

export function finalizationStateToken(source: HumanFinalizationSourceRecords) {
  return {
    projectId: source.project.id,
    projectStatus: source.project.status,
    projectUpdatedAt: source.project.updatedAt,
    benchmarkPackId: source.benchmarkPack.id,
    benchmarkPackVersion: source.benchmarkPack.version,
    itemState: sortItemsBySourceOrder(source.items).map((item) => canonicalizeFinalizationPayload(item)),
    importRunState: [...source.importRuns].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)).map((run) => canonicalizeFinalizationPayload(run)),
    annotationRevisions: source.annotations
      .filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID)
      .map((annotation) => ({ id: annotation.id, itemId: annotation.itemId, revision: annotation.revision, status: annotation.status, updatedAt: annotation.updatedAt }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.id.localeCompare(right.id)),
    annotationState: source.annotations
      .filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID)
      .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.id.localeCompare(right.id))
      .map((annotation) => canonicalizeFinalizationPayload(annotation)),
  };
}

export async function prepareHumanValidationFinalization(
  database: SafeFlowDatabase,
  projectId: string,
  options: { now?: string; createId?: () => string; applicationVersion?: string } = {},
): Promise<PreparedHumanValidationFinalization> {
  const source = await database.getHumanFinalizationSource(projectId);
  if (!source) throw new HumanFinalizationValidationError(["Project not found."]);
  if (source.project.status === "HUMAN_FINALIZED" || source.project.status === "UNBLINDED") throw new HumanFinalizationValidationError(["Human validation has already been finalized for this project."]);
  const eligibility = evaluateHumanFinalizationEligibility(source);
  if (!eligibility.eligible) throw new HumanFinalizationValidationError(eligibility.issues.map((issue) => issue.externalItemId ? `${issue.externalItemId}: ${issue.message}` : issue.message));
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const primaryImport = [...source.importRuns].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]!;
  const annotationsByItem = new Map(source.annotations.filter((annotation) => annotation.validatorId === LOCAL_VALIDATOR_ID).map((annotation) => [annotation.itemId, annotation]));
  const orderedItems = sortItemsBySourceOrder(source.items);
  const rubricVersion = source.benchmarkPack.version;
  const finalizationId = createId();
  const payload = {
    id: finalizationId,
    schemaVersion: HUMAN_FINALIZATION_SCHEMA_VERSION,
    projectId: source.project.id,
    finalizationSequence: 1,
    status: "FINALIZED" as const,
    validatorId: LOCAL_VALIDATOR_ID,
    benchmark: {
      benchmarkId: source.benchmarkPack.id,
      benchmarkVersion: source.benchmarkPack.provenance.benchmarkVersion,
      benchmarkPackVersion: source.benchmarkPack.version,
      rubricVersion,
    },
    source: {
      fileName: primaryImport.sourceName,
      fileSha256: primaryImport.sourceSha256!,
      importRunId: primaryImport.id,
      importTimestamp: primaryImport.createdAt,
    },
    projectSnapshot: {
      projectName: source.project.name,
      sourceRows: primaryImport.itemCount,
      excludedItems: 0,
      totalItems: source.items.length,
      includedItems: source.items.length,
      submittedAnnotations: source.items.length,
      flaggedAnnotations: eligibility.summary.flagged,
      lowConfidenceAnnotations: eligibility.summary.lowConfidence,
      mediumConfidenceFlaggedAnnotations: eligibility.summary.mediumConfidenceFlagged,
    },
    annotations: orderedItems.map((item) => {
      const annotation = annotationsByItem.get(item.id)!;
      const score = annotation.answers.score!;
      const category = source.benchmarkPack.categories.find((candidate) => candidate.id === item.categoryId);
      const flagReason = annotation.answers["flag-reason"];
      const reasoning = annotation.answers.reasoning;
      return {
        itemId: item.id,
        ...(item.externalId ? { externalItemId: item.externalId } : {}),
        ...(stringMetadata(item, "benchmarkPromptId") ? { promptId: stringMetadata(item, "benchmarkPromptId") } : {}),
        ...(stringMetadata(item, "promptGroupId") ? { promptGroupId: stringMetadata(item, "promptGroupId") } : {}),
        prompt: item.prompt,
        response: item.response,
        sourceRowIndex: item.metadata.importSourceRow as number,
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
        ...(taxonomyPath(category) ? { taxonomyPath: taxonomyPath(category) } : {}),
        labelId: String(score),
        ...(typeof score === "number" ? { numericValue: score } : {}),
        confidence: confidence(annotation.answers.confidence),
        ...(typeof reasoning === "string" ? { reasoning } : {}),
        evidenceSpans: annotation.evidenceSpans.map((span) => ({ source: "response" as const, startOffset: span.start, endOffset: span.end, quotedText: span.text })),
        needsReview: annotation.answers["needs-review"] === true,
        ...(typeof flagReason === "string" && flagReason ? { flagReasons: [flagReason] } : {}),
        annotationId: annotation.id,
        annotationRevision: annotation.revision,
        annotationRole: "PRIMARY" as const,
        annotationCreatedAt: annotation.createdAt,
        annotationUpdatedAt: annotation.updatedAt,
        annotationSubmittedAt: annotation.submittedAt!,
        benchmarkPackId: annotation.benchmarkPackId,
        benchmarkPackVersion: annotation.benchmarkPackVersion!,
        rubricVersion: annotation.rubricVersion!,
        finalizedAt: now,
      };
    }),
    finalizedAt: now,
    provenance: {
      application: "SafeFlow Human Validator" as const,
      applicationVersion: options.applicationVersion ?? "0.1.0",
      schemaVersion: HUMAN_FINALIZATION_SCHEMA_VERSION,
      benchmarkId: source.benchmarkPack.id,
      benchmarkVersion: source.benchmarkPack.provenance.benchmarkVersion,
      benchmarkPackVersion: source.benchmarkPack.version,
      rubricVersion,
      sourceFileName: primaryImport.sourceName,
      sourceFileSha256: primaryImport.sourceSha256!,
      importRunId: primaryImport.id,
      validatorId: LOCAL_VALIDATOR_ID,
      localOnly: true as const,
    },
  };
  const snapshotHash = await hashFinalizationPayload(payload);
  const finalization: HumanValidationFinalization = { ...payload, snapshotHash };
  const auditEvent: HumanValidationAuditEvent = {
    id: createId(),
    type: "human_validation_finalized",
    projectId,
    finalizationId,
    finalizationSequence: 1,
    createdAt: now,
    metadata: {
      snapshotHash,
      itemCount: finalization.annotations.length,
      benchmarkId: finalization.benchmark.benchmarkId,
      benchmarkVersion: finalization.benchmark.benchmarkVersion,
      rubricVersion: finalization.benchmark.rubricVersion,
    },
  };
  return { finalization, auditEvent, expectedState: finalizationStateToken(source), eligibility };
}

export async function finalizeHumanValidation(
  database: SafeFlowDatabase,
  projectId: string,
  options: { acknowledgeWarnings: boolean; now?: string; createId?: () => string } = { acknowledgeWarnings: false },
): Promise<HumanValidationFinalization> {
  const prepared = await prepareHumanValidationFinalization(database, projectId, options);
  if (prepared.eligibility.warnings.length && !options.acknowledgeWarnings) {
    throw new HumanFinalizationValidationError(["Flagged or low-confidence annotations require explicit acknowledgement before finalization."]);
  }
  await database.commitHumanValidationFinalization(prepared);
  return prepared.finalization;
}
