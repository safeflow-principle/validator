# Architecture

## Status

This document describes the initial skeleton, not the full MVP. The governing principle is:

> annotation engine + benchmark pack

AIR-BENCH 2024 is a pack consumed by the engine, not a set of rules embedded in application components.

## Proposed repository tree

```text
validator/
├── benchmark-packs/
│   └── air-bench-2024/
│       └── pack.json
├── docs/
│   ├── architecture.md
│   ├── benchmark-pack-spec.md
│   ├── implementation-spec.md
│   ├── local-privacy-model.md
│   └── managed-validation-future.md
├── schemas/
│   └── benchmark-pack.schema.json
├── src/
│   ├── annotation/
│   │   ├── AnnotationScreen.tsx
│   │   ├── AnnotationScreen.test.tsx
│   │   ├── stateMachine.ts
│   │   └── stateMachine.test.ts
│   ├── benchmarks/
│   │   ├── loader.ts
│   │   └── loader.test.ts
│   ├── core/
│   │   └── types.ts
│   ├── pages/
│   │   └── MockAnnotationPage.tsx
│   ├── storage/
│   │   ├── database.ts
│   │   ├── database.test.ts
│   │   └── schema.ts
│   ├── test/setup.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── routes.ts
│   └── styles.css
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

Milestone 2 begins with a bounded `src/import` module. Future work should add `src/export` and `src/analysis` without coupling those concerns to annotation components.

The first source adapter is the read-only AIR-BENCH CLI in `scripts/import-airbench.ts`. It validates two `llm_eval_clean` exports against exact observed schemas, cross-checks them row-for-row, and deterministically emits `prompts.jsonl`, `taxonomy.json`, and `source-manifest.json`. Generated prompt data remains separate from the reusable pack definition and is not bundled into the annotation UI.

AIR-BENCH taxonomy assets maintain two parallel representations: the exact dataset encoding and the official conceptual hierarchy. Most leaves reference one conceptual Level 3 node. Source encodings `3940` and `4142` remain unchanged but carry composite relationships for `Discriminatory Activities × Protected Characteristics` and `Unauthorized Privacy Violations × Types of Sensitive Data`. Reference UI consumes the conceptual relationship while audit/export paths retain the source encoding.

## Module boundaries

| Boundary | Responsibility | Must not know |
|---|---|---|
| Annotation UI | Render a `BlindedValidationItem`, pack-defined fields, and annotation workflow | Judge artifacts, reference artifacts, other annotations |
| Annotation state machine | Pure transitions, required-field validation, save/finalize lifecycle | IndexedDB, React, benchmark-specific labels |
| Benchmark loader | Validate and clone versioned JSON packs | Project or evaluation data |
| Local storage | Persist entities and atomic import bundles in browser IndexedDB | UI layout or benchmark semantics |
| Dataset import | Parse local files, map columns, preflight records, and construct separated entities | React layout, annotation state, network services |
| Route composition | Resolve local records and give the UI only blinded views | Hidden data during active validation |

Blinding is structural. `JudgeArtifact` and `ReferenceArtifact` are separate entities and stores. `getBlindedItem()` constructs a narrow object and drops metadata. `AnnotationScreen` has no prop through which judge output, reference labels, or another validator's annotation can arrive. This avoids rendering sensitive fields and then hiding them with CSS.

## Domain model

```text
Project
  └── ValidationItem (many)
        ├── Annotation (many; one per validator identity)
        ├── JudgeArtifact (many; isolated)
        ├── ReferenceArtifact (zero or one; isolated)
        └── AdjudicatedAnnotation (zero or one; derived later)
```

`Annotation` is never embedded in `ValidationItem`. This supports multiple independent annotations and later adjudication without migrating the core relationship. The MVP's validator ID is a local pseudonymous identifier, not an authenticated account.

## IndexedDB schema

Database: `safeflow-human-validator`, version `1`.

| Store | Primary key | Important indexes |
|---|---|---|
| `projects` | `id` | status |
| `validationItems` | `id` | project; unique project + external ID |
| `annotations` | `id` | item; project; unique item + validator; status |
| `adjudicatedAnnotations` | `id` | unique item; project |
| `judgeArtifacts` | `id` | item; unique item + judge |
| `referenceArtifacts` | `id` | unique item |
| `benchmarkPacks` | `key` (`id@version`) | pack ID |
| `importRuns` | `id` | project |

Native IndexedDB is used to minimize runtime surface and keep the storage boundary explicit. Schema upgrades must be additive or include a tested migration in `onupgradeneeded`. Project, validation-item, judge-artifact, reference-artifact, and import-run records are committed in one transaction so partially imported datasets are not visible.

## Milestone 2 import boundary

The implemented import path is `local File → parser → explicit column mapping → preflight → entity builder → one IndexedDB transaction`. CSV, JSON, JSONL, and NDJSON are accepted. Parsing and preflight occur entirely in browser memory; persistence is disabled until preflight has no errors.

Required mappings are prompt and response. External ID, category ID, automated-judge score/reasoning, and reference label are optional explicit mappings. Mapped judge and reference values are removed from item metadata and written to their isolated entity stores. Unmapped columns remain item metadata, but annotation-facing retrieval drops all metadata.

Current preflight detects malformed input, missing mappings/content, CSV shape errors, duplicate external IDs, unknown benchmark categories, and non-scalar judge/reference values. It reports artifact counts before import. Large-file streaming, configurable coercion, saved mapping templates, cancellation, and recovery are not implemented yet.

## Annotation state machine

States are `loading`, `editing`, `saving`, and `finalized`.

```text
loading --LOADED--> editing
editing --ANSWER/NOTES_CHANGED--> editing(dirty)
editing --SAVE_REQUESTED--> saving --SAVE_SUCCEEDED--> editing(clean)
editing --FINALIZE_REQUESTED + valid--> saving --SAVE_SUCCEEDED--> finalized
saving --SAVE_FAILED--> editing(dirty, error)
finalized --any event--> finalized
```

Finalization validates required fields from the active pack. A finalized annotation is immutable in this skeleton. Reopening or superseding a final annotation requires a future audited workflow; silently editing it is intentionally unsupported.

## Route map

| Route | Purpose | Current status |
|---|---|---|
| `/` | Local welcome and entry point | Implemented |
| `/mock/annotation` | Synthetic blinded annotation | Implemented |
| `/projects` | Local projects | Planned MVP |
| `/projects/:projectId` | Local project and item status | Planned MVP |
| `/projects/:projectId/annotate/:itemId` | Real blinded annotation workspace | Planned MVP |
| `/settings/data` | Local dataset import, mapping, and preflight | Milestone 2 implemented slice |

The skeleton uses a minimal pathname switch because only two routes are active. A router should be introduced when real parameterized routes are implemented, not before.

## Auditability

- All domain records have stable IDs and timestamps.
- Annotations have a monotonic revision and explicit finalization timestamp.
- Benchmark pack identity and version are recorded on projects and annotations.
- Pack prose carries field-level provenance.
- Future mutation history should be append-only; it is not implemented in this milestone.

## Assumptions and ambiguities

- The supplied implementation specification does not define a detailed Milestone 2 file contract. The first import slice therefore accepts record-oriented CSV/JSON/JSONL, requires explicit prompt/response mapping, and favors blocking ambiguous category IDs over silently coercing them.
- Official AIR-BENCH judge prompts exist upstream. The reference panel includes only a cited SafeFlow paraphrase of their scoring rules; category-specific prompt text is not bundled, and the panel explicitly marks that rubric unavailable.
- “Finalized” is treated as immutable because this best preserves auditability. A correction/supersession model is deferred.
- A single local validator is represented by a stable local ID. No account or identity proof is implied.
- “Remain local to the browser” means IndexedDB is authoritative for the MVP. No service worker, sync, server endpoint, or remote backup is included.
- Adjudication is represented in the schema but has no UI or workflow in this milestone.
