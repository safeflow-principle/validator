> Historical note: this document specifies the original local-first MVP. The current application preserves that Local Workspace boundary and also offers a separately configured, explicit Cloud Workspace. See `docs/architecture.md`, `docs/configuration.md`, and `docs/local-privacy-model.md` for the implemented architecture.

You are building the SafeFlow Human Validator.

The authoritative implementation requirements are in:

`docs/implementation-spec.md`

Read that document completely before making implementation decisions.

## Objective

Build the local-first MVP described in the specification. This is a research-grade human-validation tool for independently evaluating LLM judges, beginning with AIR-BENCH 2024.

Do not attempt to implement the entire roadmap in one pass.

## First task: architecture and skeleton only

Before building the full application, complete the **Initial Deliverable** defined in the specification:

1. Proposed repository tree
2. Core TypeScript interfaces
3. IndexedDB schema
4. Benchmark-pack JSON schema
5. AIR-BENCH benchmark-pack skeleton
6. Route map
7. Annotation state-machine implementation
8. Mock annotation screen

Also create:

- `README.md`
- `docs/architecture.md`
- `docs/local-privacy-model.md`
- `docs/benchmark-pack-spec.md`
- `docs/managed-validation-future.md`

## Important constraints

Do not add:

- authentication
- cloud databases
- server-side file storage
- telemetry
- analytics trackers
- remote LLM calls
- AI annotation assistance
- multi-user workforce management
- payments
- managed-validation functionality

Those are explicitly outside the MVP.

## Privacy requirement

Uploaded prompts, responses, judge scores, annotations, and metadata must remain local to the user's browser.

No evaluation data may be transmitted to SafeFlow or any third party.

Do not include Google Analytics, Sentry, Mixpanel, remote logging, external fonts, or similar services.

## Blinding requirement

The automated judge's score and reasoning must exist separately from the human annotation data.

Before human validation is finalized:

- annotation components must not receive judge scores as props;
- judge reasoning must not appear in the validator DOM;
- reference labels must not appear;
- other validator labels must not appear.

Do not merely hide this information using CSS.

## Benchmark architecture requirement

Do not hard-code the application around AIR-BENCH.

Implement:

`annotation engine + benchmark pack`

AIR-BENCH 2024 is the first benchmark pack.

The same application should later support StrongREJECT, HarmBench, SafeFlow benchmarks, and custom benchmarks.

## AIR-BENCH provenance requirement

Do not invent official AIR-BENCH category-specific rubrics.

Clearly distinguish:

- official benchmark material
- SafeFlow paraphrase
- SafeFlow interpretation
- SafeFlow-authored examples

If an official category-specific rubric has not been supplied, represent it as unavailable rather than generating one and labeling it official.

## Data-model requirement

Although MVP uses one local validator, design the underlying entities so that later we can support:

`project → items → multiple annotations → adjudicated annotation`

Annotations must therefore be separate entities from validation items.

## Development approach

Work milestone by milestone.

For this first task:

1. inspect the implementation spec;
2. propose the architecture;
3. create the project skeleton;
4. create the core schemas/interfaces;
5. implement the storage abstraction and IndexedDB schema;
6. create the benchmark-pack loader and AIR-BENCH skeleton;
7. implement the state machines;
8. create a mock annotation route using synthetic data;
9. add tests for the architecture-critical pieces.

Do not proceed into full dataset import, analytics, or managed-validation features until this foundation is working.

## At completion

Report:

- files created;
- important architectural decisions;
- assumptions made;
- requirements not yet implemented;
- tests run and results;
- any places where the implementation spec is ambiguous.

Where a requirement is ambiguous, favor the simplest implementation that preserves privacy, blinding, auditability, and future extensibility.
