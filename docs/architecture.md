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

Future milestones should add bounded modules such as `src/import`, `src/export`, and `src/analysis` rather than coupling those concerns to annotation components.

## Module boundaries

| Boundary | Responsibility | Must not know |
|---|---|---|
| Annotation UI | Render a `BlindedValidationItem`, pack-defined fields, and annotation workflow | Judge artifacts, reference artifacts, other annotations |
| Annotation state machine | Pure transitions, required-field validation, save/finalize lifecycle | IndexedDB, React, benchmark-specific labels |
| Benchmark loader | Validate and clone versioned JSON packs | Project or evaluation data |
| Local storage | Persist entities in browser IndexedDB | UI layout or benchmark semantics |
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

Native IndexedDB is used to minimize runtime surface and keep the storage boundary explicit. Schema upgrades must be additive or include a tested migration in `onupgradeneeded`. Multi-store imports should eventually use one transaction so partially imported datasets are not visible.

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
| `/settings/data` | Local import, export, and deletion | Planned MVP |

The skeleton uses a minimal pathname switch because only two routes are active. A router should be introduced when real parameterized routes are implemented, not before.

## Auditability

- All domain records have stable IDs and timestamps.
- Annotations have a monotonic revision and explicit finalization timestamp.
- Benchmark pack identity and version are recorded on projects and annotations.
- Pack prose carries field-level provenance.
- Future mutation history should be append-only; it is not implemented in this milestone.

## Assumptions and ambiguities

- The supplied implementation specification contains no AIR-BENCH taxonomy, official category rubric, label scale, citation URL, or dataset contract. The pack therefore contains one `unavailable` category and one explicitly SafeFlow-authored synthetic field only to exercise the engine.
- “Finalized” is treated as immutable because this best preserves auditability. A correction/supersession model is deferred.
- A single local validator is represented by a stable local ID. No account or identity proof is implied.
- “Remain local to the browser” means IndexedDB is authoritative for the MVP. No service worker, sync, server endpoint, or remote backup is included.
- Adjudication is represented in the schema but has no UI or workflow in this milestone.
