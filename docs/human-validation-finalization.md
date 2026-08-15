# Human Validation Finalization

## Purpose

Production annotations are editable working records. Human Validation Finalization converts the current complete set of submitted local-validator annotations into a separate immutable research artifact. The project then enters `HUMAN_FINALIZED`, production annotation controls are locked, and human-only results remain inspectable without revealing automated-judge or reference artifacts.

> Once human validation has been finalized, any downstream human-vs-judge analysis must reference a specific immutable human finalization snapshot rather than the project's current mutable annotation records.

Finalized human annotations are not called truth, ground truth, gold labels, or adjudicated labels. They preserve one validator's final human record.

## Data boundary

`Annotation` remains the mutable working entity. `HumanValidationFinalization` is stored separately in `humanValidationFinalizations` and copies every included item's prompt, response, category, human score, confidence, reasoning, evidence quote and offsets, review flag, annotation ID, annotation revision, timestamps, and pack/rubric versions. It does not merely point to the mutable annotation.

The MVP treats every imported validation item as included. Item exclusion is not currently supported, so source rows, total items, and included items are equal. A record marked `skipped` cannot be finalized. Future exclusion support must record both `included` and a reason for any exclusion.

## Eligibility

Finalization re-reads persistent project, item, annotation, import, and benchmark-pack state. It requires:

- a `HUMAN_COMPLETE` project;
- one submitted local-validator annotation per included item;
- valid pack-defined score, confidence, and required reasoning;
- internally consistent submission timestamps and monotonic revisions;
- exact evidence quote/offset agreement with the response;
- annotation benchmark, pack, and rubric versions matching the project;
- source-row, source filename, source SHA-256, import-run, and benchmark-pack provenance.

The current benchmark pack has no rule requiring an evidence span, so zero evidence spans is valid; any span that exists must be exact. Low confidence and `needs-review` are warnings rather than blockers and require explicit user acknowledgement.

## Atomic commit and stale revisions

Web Crypto SHA-256 is asynchronous, while a native IndexedDB transaction cannot safely remain open across unrelated asynchronous work. SafeFlow therefore uses a two-phase operation:

1. Read current human-side persistent records, validate eligibility, construct the deterministic snapshot, and calculate its SHA-256 with Web Crypto.
2. Start one read/write transaction over only projects, items, annotations, imports, benchmark packs, human finalizations, and audit events. Re-read and canonically compare the project, source items, imports, and complete annotation payloads. If any state changed, abort. Otherwise add the immutable snapshot, transition the project to `HUMAN_FINALIZED`, and add `human_validation_finalized` in the same transaction.

No partial finalization is visible. A stale revision aborts before any snapshot, status, or audit record is committed. A second MVP finalization is rejected.

## Canonicalization and hashing

The snapshot hash excludes only `snapshotHash`. Canonical serialization recursively:

- removes undefined properties;
- sorts every object key lexicographically;
- preserves deterministic source-row annotation ordering;
- preserves array order and exact strings;
- rejects unsupported values and non-finite numbers.

SHA-256 covers the finalization ID, project and source identity, source hash, benchmark/rubric versions, finalization timestamp, full finalized annotation values, revisions, prompts/responses, and evidence quotes/offsets. The hash is an integrity check for the local snapshot; it is not a server signature or validator identity proof.

## Blinding

Preparation and commit do not open `judgeArtifacts` or `referenceArtifacts`. The snapshot schema has no fields for judge scores/reasoning, reference labels, other annotations, adjudication, expected answers, or comparison results. `HUMAN_FINALIZED` freezes the human side only; it does not unblind the judge.

Finalized results and finalized CSV read from `HumanValidationFinalization`. The human-only pages and exports do not join isolated artifact stores.

## Revisions and immutability

Every finalized item stores the exact annotation revision used. There is no repository update method for a finalization. Normal annotation persistence rejects changes after `HUMAN_FINALIZED`. Even direct test mutation of an underlying annotation cannot alter the stored historical snapshot.

## Backup and restore

Backup schema `1.3` stores human finalizations, immutable judge analyses, methodology-versioned reports, and project-scoped audit events in the workflow section while source judge/reference values remain in `isolatedArtifacts`. Restore recalculates every human snapshot, judge artifact set, analysis, and report SHA-256 before opening the atomic restore transaction. A mismatch rejects the entire restore; SafeFlow never repairs a finalized hash silently.

## Future amendments

Amendments are not implemented. A future correction workflow must preserve finalization sequence 1 and create a new snapshot with a higher `finalizationSequence`, `previousFinalizationId`, and `supersedesFinalizationId`. It must never update the original snapshot.

## Future analytics contract

Judge analysis accepts a stable `finalizationId` and never derives the human side from `projectId + current annotations`. The explicit unblinding flow is documented in [`judge-analysis.md`](judge-analysis.md). Richer analytics, adjudication, and multi-validator workflows remain separate future milestones.
