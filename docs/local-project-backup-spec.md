# Local project backup format

SafeFlow project backups use the compound extension `.safeflow.json` and the format identifier `safeflow-project-backup`. New exports use schema version `1.3`, validated against [`schemas/safeflow-project-backup.schema.json`](../schemas/safeflow-project-backup.schema.json). Legacy `1.0` through `1.2` backups remain importable and are normalized locally.

## Structure

The top-level document contains:

- `provenance`: identifies a Persistent Local SafeFlow browser export;
- `workflow`: project state, source filename and SHA-256, import records, exact benchmark pack and rubric version, calculated human progress, validation items, annotations, immutable human finalizations, immutable judge analyses, methodology-versioned analysis reports, and project audit events;
- `isolatedArtifacts`: automated judge and reference-label records.

Judge and reference artifacts are deliberately not embedded in items, annotations, progress, or benchmark metadata. Restore writes them back to their separate IndexedDB stores. Annotation and review routes continue to use blinded item retrieval and never deserialize the backup directly.

The embedded benchmark pack makes the backup self-contained and preserves the exact annotation/rubric semantics used by the project. `rubricVersion` currently equals the immutable benchmark-pack content version because rubrics are versioned as part of the pack rather than as a separate installable entity.

## Validation and restore

Before restore, SafeFlow verifies:

- JSON Schema conformance;
- project, item, annotation, import, and artifact relationships;
- unique entity IDs within each collection;
- benchmark pack and rubric version agreement;
- exact evidence text at the stored UTF-16 offsets;
- the saved progress snapshot against the included items and local annotations;
- source filename and SHA-256 agreement with the primary import record.
- finalized-annotation item relationships and matching content-free audit events;
- every immutable human finalization's canonical SHA-256.
- every snapshotted judge artifact, judge-artifact set, and immutable judge analysis SHA-256.
- every immutable judge-analysis report SHA-256 and its analysis/finalization relationships.

All restored records and the embedded benchmark pack are committed in one IndexedDB transaction. A backup whose project ID already exists is rejected; restore never silently overwrites local work.

## Annotated CSV

Before finalization, the current-annotations CSV contains blinded item fields and local working annotation fields. After finalization, export defaults to the immutable snapshot and adds `human_finalized`, finalization ID/time, snapshot hash, annotation revision, rubric version, and benchmark-pack version. Neither path queries or contains judge artifacts, reference labels, comparison metrics, or adjudication results.

CSV cells are quoted using RFC 4180-style escaping. Values beginning with spreadsheet formula control characters are prefixed with an apostrophe to reduce formula-injection risk when opened in spreadsheet applications.
