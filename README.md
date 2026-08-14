# SafeFlow Human Validator

SafeFlow Human Validator is a local-first research tool for independently evaluating automated LLM judges. The repository contains the initial architecture deliverable, an AIR-BENCH taxonomy reference-panel vertical slice, and the beginning of Milestone 2 dataset import.

The application does not transmit evaluation data. It has no authentication, backend database, server-side uploads, telemetry, remote logging, remote model calls, or managed-validation functionality.

## Run locally

Requirements: a current Node.js LTS release and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, then choose **Open synthetic annotation**, or navigate directly to `/mock/annotation`.

The mock route includes ordinary, discrimination-composite, and privacy-composite AIR-BENCH cases. `/settings/data` provides browser-local CSV/JSON/JSONL parsing, field mapping, preflight, and an atomic IndexedDB import.

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
- The reducer-based annotation state machine supports editing, local save, validation, finalization, error recovery, and immutable finalized state.
- The mock route uses only synthetic data.
- AIR-BENCH reference metadata preserves exact source encodings while rendering the separate 45-node conceptual taxonomy.
- Imported judge scores/reasoning and reference labels become isolated artifacts, never validation-item metadata or annotation props.
- Dataset preflight checks mappings, required content, duplicate external IDs, scalar hidden fields, and AIR-BENCH category IDs before local persistence.

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
  storage/                     # native IndexedDB schema and repository
  test/                        # shared test setup
  App.tsx
  routes.ts
  styles.css
```

Architectural rationale is in [docs/architecture.md](docs/architecture.md). Privacy constraints are in [docs/local-privacy-model.md](docs/local-privacy-model.md).

## Current scope limits

This is not yet a complete validator. Import preview pagination, import cancellation/recovery, project management UI, resume/navigation across real items, export, adjudication UI, comparison analytics, rubric version migration, and recovery tooling remain future MVP work. See the architecture document for the complete boundary.
