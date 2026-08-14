# Architecture

## Status

This document describes the local-first workflow through human-validation completion, before project finalization or judge comparison. The governing principle is:

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
│   ├── annotation/               # blinded UI, evidence offsets, state machine
│   ├── benchmarks/
│   │   ├── generated/            # normalized AIR-BENCH prompt/taxonomy assets
│   │   ├── loader.ts
│   │   ├── promptIndex.ts
│   │   └── taxonomyReference.ts
│   ├── core/                     # domain interfaces and local validator identity
│   ├── import/                   # parsing, hydration, preflight, entity builder
│   ├── pages/                    # project, annotation, review, import routes
│   ├── projects/                 # progress and deterministic resume logic
│   ├── storage/                  # IndexedDB schema and repository
│   ├── test/                     # shared test setup
│   ├── App.tsx
│   ├── main.tsx
│   ├── routes.ts
│   └── styles.css
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

The current milestone includes a bounded `src/import` module and the complete human-validation workflow. Future work should add `src/export` and `src/analysis` without coupling those concerns to annotation components.

The first source adapter is the read-only AIR-BENCH CLI in `scripts/import-airbench.ts`. It validates two `llm_eval_clean` exports against exact observed schemas, cross-checks them row-for-row, and deterministically emits `prompts.jsonl`, `taxonomy.json`, and `source-manifest.json`. Generated prompt data remains separate from the reusable pack definition. The normalized prompt index is currently bundled as a static local asset so imports can hydrate recognized prompt IDs without a network or server dependency.

AIR-BENCH taxonomy assets maintain two parallel representations: the exact dataset encoding and the official conceptual hierarchy. Most leaves reference one conceptual Level 3 node. Source encodings `3940` and `4142` remain unchanged but carry composite relationships for `Discriminatory Activities × Protected Characteristics` and `Unauthorized Privacy Violations × Types of Sensitive Data`. Reference UI consumes the conceptual relationship while audit/export paths retain the source encoding.

## Module boundaries

| Boundary | Responsibility | Must not know |
|---|---|---|
| Annotation UI | Render a `BlindedValidationItem`, pack-defined fields, and annotation workflow | Judge artifacts, reference artifacts, other annotations |
| Annotation state machine | Pure transitions, required-field validation, draft/submission lifecycle, evidence edits, save intents | IndexedDB, React, benchmark-specific labels |
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

Required input is a response plus either an explicit prompt or a recognized benchmark prompt ID. External ID, category ID, benchmark prompt ID, automated-judge score/reasoning, and reference label are explicit mappings. Mapped judge and reference values are removed from item metadata and written to their isolated entity stores. Unmapped columns remain item metadata, but annotation-facing retrieval drops all metadata.

Recognized AIR-BENCH prompt identifiers hydrate missing canonical prompt text and category ID from the generated prompt index. Explicit uploaded values always win semantically: if they conflict with canonical data, preflight blocks the import rather than overwriting either value. Item metadata records field origins as uploaded source, AIR-BENCH benchmark asset, or SafeFlow-derived mapping.

Current preflight detects malformed input, missing mappings/content, CSV shape errors, duplicate external IDs, unknown benchmark categories, and non-scalar judge/reference values. It reports artifact counts before import. Large-file streaming, configurable coercion, saved mapping templates, cancellation, and recovery are not implemented yet.

## Annotation state machine

States are `loading`, `editing`, `saving`, and `save-error`.

```text
loading --LOADED--> editing
editing --ANSWER/EVIDENCE_CHANGED--> editing(dirty,draft)
editing --autosave/navigation--> saving --SAVE_SUCCEEDED--> editing(clean)
editing --SUBMIT_REQUESTED + valid--> saving(submit) --SAVE_SUCCEEDED--> editing(clean,submitted)
saving --SAVE_FAILED--> save-error --edit/retry--> editing/saving
submitted --edit--> draft
```

Submission validates score, confidence, and reasoning from the active pack. Submitted annotations count toward human progress but remain editable until the later project-finalization milestone. Every successful persistence increments the annotation revision; stale revisions are rejected.

Autosave persists score, confidence, reasoning, evidence spans, and review flags. The UI reports `Saving…` while the IndexedDB operation is pending and `Saved locally` only after it resolves.

## Resume and project status

Items are sorted by imported source-row order. A route without an explicit item first resumes the earliest draft, otherwise the first unsubmitted item, and routes to review if all items are submitted. Resume state is derived from IndexedDB records, not route or transient React state.

Project transitions are `READY → VALIDATING ↔ REVIEW → HUMAN_COMPLETE`. Editing a submitted annotation returns it to draft and moves a human-complete project back to `VALIDATING`. There is deliberately no `COMPLETE` state yet.

## Route map

| Route | Purpose | Current status |
|---|---|---|
| `/` | Local welcome and entry point | Implemented |
| `/mock/annotation` | Synthetic blinded annotation | Implemented |
| `/projects` | Local projects, progress, resume, deletion | Implemented |
| `/projects/:projectId` | Project provenance and human-validation progress | Implemented |
| `/projects/:projectId/annotate` | Real blinded annotation workspace | Implemented |
| `/projects/:projectId/review` | Human-only review and filters | Implemented |
| `/settings/data` | Local dataset import, mapping, and preflight | Milestone 2 implemented slice |

The application still uses a small pathname parser. A routing dependency remains unnecessary for this bounded route set.

## Auditability

- All domain records have stable IDs and timestamps.
- Annotations have a monotonic revision and explicit submission timestamp.
- Benchmark pack identity and version are recorded on projects and annotations.
- Pack prose carries field-level provenance.
- Future mutation history should be append-only; it is not implemented in this milestone.

## Assumptions and ambiguities

- The supplied implementation specification does not define a detailed Milestone 2 file contract. The first import slice therefore accepts record-oriented CSV/JSON/JSONL, requires explicit prompt/response mapping, and favors blocking ambiguous category IDs over silently coercing them.
- Official AIR-BENCH judge prompts exist upstream. The reference panel includes only a cited SafeFlow paraphrase of their scoring rules; category-specific prompt text is not bundled, and the panel explicitly marks that rubric unavailable.
- Item submission is intentionally editable and distinct from project finalization. Full append-only revision history and correction/supersession records are deferred; the current repository enforces monotonic revision numbers.
- A single local validator is represented by a stable local ID. No account or identity proof is implied.
- “Remain local to the browser” means IndexedDB is authoritative for the MVP. No service worker, sync, server endpoint, or remote backup is included.
- Adjudication is represented in the schema but has no UI or workflow in this milestone.
