# SafeFlow Human Validator

SafeFlow Human Validator is a local-first research tool for independently evaluating automated LLM judges. It supports importing a dataset, creating a local project, annotating structurally blinded items, autosaving drafts, leaving and resuming, reviewing human annotations, and reaching human-validation completion without revealing automated-judge results. Projects can be exported and restored as versioned `.safeflow.json` backups, and human annotations can be inspected as judge-free CSV files.

The local AIR-BENCH training module provides a separate 16-item synthetic starter lesson, including longer realistic prompt/response examples, with immediate reviewed feedback, decisive evidence, retries, confidence calibration, and deterministic mistake patterns. Practice records never enter production annotation stores.

The application does not transmit evaluation data. It has no authentication, backend database, server-side uploads, telemetry, remote logging, remote model calls, or managed-validation functionality.

## Run locally

Requirements: a current Node.js LTS release and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, then choose **Open local projects** or **Import a local dataset**.

For a safe manual exercise, import [`fixtures/airbench-like-validation-20.csv`](fixtures/airbench-like-validation-20.csv). The mock route remains available as a component/reference demo, but real imported projects are the primary workflow.

```sh
npm test
npm run build
```

To regenerate AIR-BENCH prompt and taxonomy assets from the two local `llm_eval_clean` exports:

```sh
npm run import:airbench -- \
  --prompt-set /path/to/airbench_default_prompt_set.json \
  --validation /path/to/airbench_default_validation.jsonl
```

The importer is read-only with respect to its sources and makes no network calls. See [docs/airbench-artifact-audit.md](docs/airbench-artifact-audit.md) for the schema and provenance audit.

## Implemented foundation

- Core entities support `project → items → multiple annotations → adjudicated annotation`.
- IndexedDB stores annotation data separately from judge and reference artifacts.
- Annotation-facing APIs return a structurally blinded item type.
- Benchmark packs are validated against a versioned JSON Schema.
- The AIR-BENCH 2024 pack is intentionally a skeleton; missing official taxonomy and rubrics are represented as unavailable.
- The reducer-based annotation state machine supports editable drafts and submissions, autosave, validation, retryable save errors, evidence spans, and monotonic revisions.
- The mock route uses only synthetic data.
- AIR-BENCH reference metadata preserves exact source encodings while rendering the separate 45-node conceptual taxonomy.
- Imported judge scores/reasoning and reference labels become isolated artifacts, never validation-item metadata or annotation props.
- Dataset preflight checks mappings, required content, duplicate external IDs, scalar hidden fields, and AIR-BENCH category IDs before local persistence.
- Recognized AIR-BENCH prompt IDs can hydrate missing canonical prompt/category metadata; explicit conflicts block import and every hydrated field records provenance.
- `/projects`, project detail, real annotation, and human-only review routes implement deterministic source-order navigation and persistent resume semantics.
- Project states are `READY`, `VALIDATING`, `REVIEW`, and `HUMAN_COMPLETE`; project finalization is intentionally deferred.
- Project backups preserve exact local workflow state and keep judge/reference records under a separate `isolatedArtifacts` envelope; restore is schema-validated and atomic.
- Annotated CSV export reads only blinded items and the local validator's annotations.
- `/training` provides approved, fixed-gold practice content in stores and routes separate from production annotation.

## Repository map

```text
benchmark-packs/
  air-bench-2024/pack.json     # first pack; provenance-safe skeleton
docs/
  architecture.md
  benchmark-pack-spec.md
  implementation-spec.md
  local-privacy-model.md
  managed-validation-future.md
schemas/
  benchmark-pack.schema.json   # JSON Schema draft 2020-12
src/
  annotation/                  # blinded UI and pure state machine
  benchmarks/                  # validated pack loader
  core/                        # domain interfaces
  pages/                       # route-level composition
  projects/                    # progress and deterministic resume rules
  import/                      # parsing, hydration, mapping, preflight, bundle construction
  storage/                     # native IndexedDB schema and repository
  test/                        # shared test setup
  App.tsx
  routes.ts
  styles.css
```

Architectural rationale is in [docs/architecture.md](docs/architecture.md). Privacy constraints are in [docs/local-privacy-model.md](docs/local-privacy-model.md). The portable backup contract is documented in [docs/local-project-backup-spec.md](docs/local-project-backup-spec.md), and the practice boundary in [docs/training-practice-spec.md](docs/training-practice-spec.md).

## Current scope limits

This milestone intentionally stops before project finalization and judge comparison. Import preview pagination, cancellation/recovery, export, append-only revision history, adjudication, multi-validator workflows, comparison analytics, rubric migration, and backup/recovery remain future work.
