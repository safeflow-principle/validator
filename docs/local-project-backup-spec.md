# Local project backup format

SafeFlow project backups use the compound extension `.safeflow.json` and the format identifier `safeflow-project-backup`. Schema version `1.0` is validated against [`schemas/safeflow-project-backup.schema.json`](../schemas/safeflow-project-backup.schema.json) before any records are written.

## Structure

The top-level document contains:

- `provenance`: identifies a Persistent Local SafeFlow browser export;
- `workflow`: project state, source filename and SHA-256, import records, exact benchmark pack and rubric version, calculated human progress, validation items, and annotations;
- `isolatedArtifacts`: automated judge and reference-label records.

Judge and reference artifacts are deliberately not embedded in items, annotations, progress, or benchmark metadata. Restore writes them back to their separate IndexedDB stores. Annotation and review routes continue to use blinded item retrieval and never deserialize the backup directly.

The embedded benchmark pack makes the backup self-contained and preserves the exact annotation/rubric semantics used by the project. In schema version `1.0`, `rubricVersion` equals the immutable benchmark-pack content version because rubrics are versioned as part of the pack rather than as a separate installable entity.

## Validation and restore

Before restore, SafeFlow verifies:

- JSON Schema conformance;
- project, item, annotation, import, and artifact relationships;
- unique entity IDs within each collection;
- benchmark pack and rubric version agreement;
- exact evidence text at the stored UTF-16 offsets;
- the saved progress snapshot against the included items and local annotations;
- source filename and SHA-256 agreement with the primary import record.

All restored records and the embedded benchmark pack are committed in one IndexedDB transaction. A backup whose project ID already exists is rejected; restore never silently overwrites local work.

## Annotated CSV

The annotated CSV is a separate human-readable inspection export. It contains blinded item fields and local human annotation fields only: status, human score, confidence, reasoning, evidence spans, review flag, revision, and update time. It does not query or contain judge artifacts, reference labels, comparison metrics, or adjudication results.

CSV cells are quoted using RFC 4180-style escaping. Values beginning with spreadsheet formula control characters are prefixed with an apostrophe to reduce formula-injection risk when opened in spreadsheet applications.
