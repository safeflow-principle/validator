# Benchmark pack specification

## Purpose

A benchmark pack supplies versioned annotation semantics to the benchmark-neutral engine. It is a local JSON document validated against [`schemas/benchmark-pack.schema.json`](../schemas/benchmark-pack.schema.json), which uses JSON Schema draft 2020-12. Generated AIR-BENCH taxonomy assets are independently validated against [`schemas/normalized-taxonomy.schema.json`](../schemas/normalized-taxonomy.schema.json).

## Required top-level fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Pack contract version; currently `1.0` |
| `id` | Stable lowercase machine identifier |
| `name` | Human-readable benchmark name |
| `version` | Immutable pack content version |
| `description` | Provenanced description |
| `provenance` | Benchmark name/version, optional primary URL, notes |
| `categories` | Category metadata and category-level rubric availability |
| `reference` | Optional provenanced generic scoring guidance and unavailable-rubric wording |
| `annotation` | Provenanced instructions and field definitions |

## Provenance

Every normative text block must declare exactly one `kind`:

- `official-benchmark-material`: supplied verbatim or faithfully transcribed from a cited authoritative source;
- `safeflow-paraphrase`: a SafeFlow restatement of cited benchmark material;
- `safeflow-interpretation`: a SafeFlow operational interpretation, not claimed as official;
- `safeflow-authored-example`: synthetic explanatory or test content;
- `unavailable`: authoritative material has not been supplied or verified.

`unavailable` requires a note and does not require text. Every other kind requires text. Official content should also include a precise citation. A pack must not infer an official category rubric from a benchmark's general description.

## Annotation fields

Supported initial types are:

- `single-choice`, with one or more scalar options;
- `boolean`;
- `number`, optionally bounded by `min` and `max`;
- `text`.

Each field has a stable ID, label, required flag, and optional provenanced help text. The skeleton UI currently renders `single-choice`; other schema types are reserved for the next annotation-engine milestone and must receive UI and state-validation tests before use in production packs.

## Versioning rules

- `schemaVersion` changes only when the engine contract changes.
- `version` changes whenever pack content changes, including wording or provenance.
- Projects and annotations record both pack ID and version context so historical decisions remain interpretable.
- Installed packs use the local key `id@version`; a new version does not overwrite an old version.
- Published pack versions should be immutable. Corrections create a new version.

## Loading and trust

`parseBenchmarkPack()` validates unknown JSON, returns a clone, and throws a structured validation error. Schema validity does not establish factual provenance; human review of citations remains required. Custom-pack import, signatures, trust warnings, and migration compatibility checks are not implemented yet.

## AIR-BENCH skeleton

The initial [`benchmark-packs/air-bench-2024/pack.json`](../benchmark-packs/air-bench-2024/pack.json) deliberately contains no invented official taxonomy or category-specific rubric. Its placeholder annotation question is marked `safeflow-authored-example` and must not be used as an official AIR-BENCH measure.

The AIR-BENCH source importer now populates the pack's category list from source artifacts. It emits prompt records separately as JSONL so the reusable pack is not coupled to a 5,694-item dataset payload. Generated `taxonomy.json` preserves the complete hierarchy; `source-manifest.json` distinguishes official fields, pipeline aliases, and SafeFlow derivations. Category-specific rubrics remain unavailable because the inspected prompt artifacts do not include the official `judge_prompts` configuration.

`taxonomy.json` intentionally has two parallel Level-3 representations:

- `sourceLevel3` preserves the dataset encoding and name exactly, including composite IDs `3940` and `4142`;
- `conceptualLevel3Nodes` always contains the complete 45-node AIR conceptual taxonomy, including when an importer is exercised against a subset of prompts;
- `conceptualLevel3` on each leaf is either a `single` node reference or a `composite` relationship with two typed dimensions and their source-encoded values.

For the composite source encodings, SafeFlow deterministically decodes the Level-4 ordinal into `Discriminatory Activities × Protected Characteristics` or `Unauthorized Privacy Violations × Types of Sensitive Data`. The importer verifies that the decoded pair exactly reconstructs the source Level-4 name, so this UI-oriented representation cannot silently diverge from the imported taxonomy. Any friendlier display text is stored separately from the exact source value and carries its own provenance.

The AIR-BENCH reference panel includes a cited SafeFlow paraphrase of the generic `0`, `0.5`, and `1` scoring rules repeated across the official judge-prompt dataset. It does not bundle or generate category-specific rubric text. Categories whose verified official rubric is not included display an explicit unavailable message.
