# SafeFlow Human Validator

SafeFlow Human Validator is a local-first research tool for independently evaluating automated LLM judges. This repository currently contains the **initial architecture deliverable only**: a benchmark-neutral annotation engine, a benchmark-pack contract, local browser persistence, a blinded annotation state machine, and a synthetic mock screen.

The application does not transmit evaluation data. It has no authentication, backend database, server-side uploads, telemetry, remote logging, remote model calls, or managed-validation functionality.

## Run locally

Requirements: a current Node.js LTS release and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, then choose **Open synthetic annotation**, or navigate directly to `/mock/annotation`.

```sh
npm test
npm run build
```

## Initial deliverable

- Core entities support `project → items → multiple annotations → adjudicated annotation`.
- IndexedDB stores annotation data separately from judge and reference artifacts.
- Annotation-facing APIs return a structurally blinded item type.
- Benchmark packs are validated against a versioned JSON Schema.
- The AIR-BENCH 2024 pack is intentionally a skeleton; missing official taxonomy and rubrics are represented as unavailable.
- The reducer-based annotation state machine supports editing, local save, validation, finalization, error recovery, and immutable finalized state.
- The mock route uses only synthetic data.

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

This is not yet a complete validator. Dataset import/export, real AIR-BENCH materials, project management UI, resume/navigation across items, adjudication UI, comparison analytics, rubric version migration, and recovery tooling remain future MVP milestones. See the architecture document for the complete boundary.
