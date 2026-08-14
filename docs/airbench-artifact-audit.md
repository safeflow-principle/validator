# AIR-BENCH artifact audit

## Scope and sources

This audit covers three read-only artifacts from `llm_eval_clean/data/results/airbench_qwen_basic_n5`:

- `airbench_default_prompt_set.json`
- `airbench_default_validation.jsonl`
- `airbench_default_prompt_space.html`

Primary-source comparison uses the [AIR-BENCH 2024 paper](https://arxiv.org/html/2407.17436) and the [official Stanford CRFM dataset](https://huggingface.co/datasets/stanford-crfm/air-bench-2024). No file in `llm_eval_clean` was modified.

## Exact observed schemas

### `airbench_default_prompt_set.json`

Top-level object:

| Field | Type | Observed value |
|---|---|---|
| `source` | string | `airbench_default_test` |
| `domain` | string | `airbench_default` |
| `prompts` | array | 5,694 prompt objects |

Every prompt has exactly these fields:

| Field | Type | Observed values |
|---|---|---|
| `id` | string | pipeline ID such as `1.1.1::0` |
| `text` | string | prompt text |
| `prompt_type` | string | always `safety_harmful` |
| `source` | string | always `airbench2024` |
| `domain` | string | always `airbench_default` |
| `risk_level` | string | always `4` |
| `notes` | null or string | always null in this artifact |
| `metadata` | object | exact schema below |

Every `metadata` object contains exactly 14 string fields:

`data_split`, `slice`, `category`, `subcategory`, `workflow`, `intent`, `expected_behavior`, `original_source`, `airbench_cate_idx`, `airbench_l2`, `airbench_l3`, `airbench_l4`, `airbench_region`, and `airbench_split`.

### `airbench_default_validation.jsonl`

There are 5,694 JSON objects, one per line. Every object has exactly 18 fields and every field is a string:

`airbench_cate_idx`, `airbench_l2`, `airbench_l3`, `airbench_l4`, `airbench_region`, `airbench_split`, `category`, `data_split`, `expected_behavior`, `intent`, `origin_source`, `prompt_id`, `risk_level`, `slice`, `source`, `subcategory`, `text`, and `workflow`.

`risk_level` is the empty string on every row, unlike the constant `"4"` in the prompt-set export. All other fields are non-empty.

The files are one-to-one and order-aligned: all 5,694 IDs, texts, official taxonomy copies, aliases, and split/source labels agree exactly.

## Counts and uniqueness

| Measure | Count |
|---|---:|
| Rows in each structured file | 5,694 |
| Unique `prompt_id`/`id` values | 5,694 |
| Unique prompt texts | 5,692 |
| Duplicate-text groups | 2 |
| Level 2/category values | 16 |
| Source-encoded Level 3/subcategory strings | 43 |
| Official conceptual Level 3 nodes | 45 |
| Level 4/workflow values | 314 |
| `intent`/`airbench_cate_idx` values | 314 |
| `expected_behavior` values | 1 (`refuse`) |

One duplicate-text pair is assigned to two different Privacy leaf categories; the other repeats within one Privacy leaf category under two IDs. Prompt IDs remain unique.

Observed Level 2/category values and prompt counts are: Security Risks (222), Operational Misuses (390), Violence & Extremism (369), Hate/Toxicity (636), Sexual Content (144), Child Harm (105), Self-harm (45), Political Usage (375), Economic Harm (150), Deception (135), Manipulation (75), Defamation (54), Fundamental Rights (75), Discrimination/Bias (1,608), Privacy (1,191), and Criminal Activities (120).

## Hierarchy represented in the artifacts

The files encode only Levels 2–4 directly. The paper supplies the four Level 1 groups. SafeFlow preserves the 43 source encodings—including `3940` and `4142`—while separately representing all 45 official conceptual Level 3 nodes. The clean mapping is:

- **System & Operational Risks**
  - Security Risks: Confidentiality; Integrity; Availability
  - Operational Misuses: Automated Decision-Making; Autonomous Unsafe Operation of Systems; Advice in Heavily Regulated Industries
- **Content Safety Risks**
  - Violence & Extremism: Supporting Malicious Organized Groups; Celebrating Suffering; Violent acts; Depicting Violence; Weapon Usage & Development; Military and Warfare
  - Hate/Toxicity: Harassment; Hate Speech (Inciting/Promoting/Expressing hatred); Perpetuating Harmful Beliefs; Offensive Language
  - Sexual Content: Adult content; Erotic; Non-Consensual Nudity; Monetized
  - Child Harm: Endangerment, Harm, or Abuse of Children; Child Sexual Abuse
  - Self-harm: Suicidal and non-suicidal self Injury
- **Societal Risks**
  - Political Usage: Political Persuasion; Influencing Politics; Deterring Democratic Participation; Disrupting Social Order (China-unique)
  - Economic Harm: High-Risk Financial Activities; Unfair Market Practices; Disempowering Workers; Schemes
  - Deception: Fraud; Academic dishonesty; Mis/disinformation
  - Manipulation: Sowing Division; Misrepresentation
- **Legal & Rights Risks**
  - Defamation: Types of Defamation
  - Fundamental Rights: Specific Types of Rights
  - Discrimination/Bias: Discrimination/Protected Characteristics Combinations
  - Privacy: Privacy Violations/Sensitive Data Combinations
  - Criminal Activities: Illegal/Regulated substances/goods; services/exploitation; Other Illegal/Unlawful/Criminal Activities

The generated [`taxonomy.json`](../benchmark-packs/air-bench-2024/generated/taxonomy.json) is the exhaustive source for all 314 unique workflow/Level 4 values, stable `cate-idx` values, parent paths, composite axes, and per-leaf prompt counts. `workflow` is an exact pipeline alias of Level 4; `intent` is an exact alias of `cate-idx` and is not a natural-language intent label.

For ordinary categories, a leaf references one conceptual Level 3 node. Composite source encodings reference two:

- `3940` remains the source encoding and resolves to **Discriminatory Activities × Protected Characteristics**. Each leaf stores an activity and characteristic independently.
- `4142` remains the source encoding and resolves to **Unauthorized Privacy Violations × Types of Sensitive Data**. Each leaf stores an unauthorized action and sensitive-data type independently.

SafeFlow-derived axis IDs and display labels are kept separate from exact source names. For example, the source value `PII (Personal Identifiable Information)` may be displayed as `Personally Identifiable Information`, with that display normalization explicitly marked SafeFlow-derived.

## Provenance classification

| Meaning | Official source field | Local field | Classification |
|---|---|---|---|
| Prompt text | `prompt` | `text` | renamed copy by `llm_eval_clean` |
| Stable leaf category ID | `cate-idx` | `airbench_cate_idx` | renamed copy by `llm_eval_clean` |
| Level 2 name | `l2-name` | `airbench_l2` | renamed copy by `llm_eval_clean` |
| Level 3 name | `l3-name` | `airbench_l3` | renamed copy by `llm_eval_clean` |
| Level 4 name | `l4-name` | `airbench_l4` | renamed copy by `llm_eval_clean` |
| Generic category alias | none | `category` | pipeline copy of Level 2 |
| Generic subcategory alias | none | `subcategory` | pipeline copy of Level 3 |
| Workflow alias | none | `workflow` | pipeline copy of Level 4 |
| Intent alias | none | `intent` | pipeline copy of `cate-idx` |
| Prompt ID | none in official row schema | `prompt_id` / `id` | pipeline-derived as `cate-idx::global row index` |
| Expected behavior | none in official prompt row | `expected_behavior=refuse` | pipeline-derived |
| Evaluation slice | none | `slice=stress` | pipeline-derived |
| Pipeline split | none | `data_split=airbench_default_test` | pipeline-derived |
| Dataset configuration/split | dataset loader context | `airbench_region=default`, `airbench_split=test` | pipeline-captured source context |
| Level 1 | paper taxonomy | generated taxonomy path | SafeFlow mapping from official Level 2 index to paper-defined Level 1 |

The local `llm_eval_clean` AIR-BENCH loader also contains mappings from Level 2 to generic prompt types, Level 3 to application domains, and a heuristic risk-level estimator. Those are pipeline interpretations, not AIR-BENCH terminology. The inspected prompt-set artifact instead flattens all rows to `prompt_type=safety_harmful`, `domain=airbench_default`, and `risk_level=4`; the validation JSONL leaves risk level empty.

## Stable category IDs

`airbench_cate_idx` is sufficient to associate every prompt with a stable AIR-BENCH Level 4 category ID. It has 314 unique values, and every value maps to exactly one Level 2/3/4 name path in these files. Names alone should not be used as IDs. SafeFlow preserves `cate-idx` verbatim as `categoryId`.

The pipeline-generated prompt ID is useful for tracing these specific exports but is not an official AIR-BENCH source field. SafeFlow namespaces it and also computes a content SHA-256; neither is misrepresented as official.

## Discrepancies and cautions

1. The paper specifies four Level 1, 16 Level 2, 45 Level 3, and 314 Level 4 categories. The artifacts expose 43 Level 3 source encodings because IDs 39/40 and 41/42 are encoded as the composites `3940` and `4142`. SafeFlow now preserves those encodings while separately exposing all 45 conceptual nodes.
2. The paper calls the 5,694 cases unique. These artifacts have 5,694 unique IDs but only 5,692 unique texts.
3. The paper describes 15–30 prompts per Level 4 category. Four categories contain 12 rows: `4.13.4`, `12.37.1`, `15.4142.12`, and `15.4142.52`.
4. The official dataset card describes `l3-name` as a Level 2 name; this appears to be a documentation typo because the data and paper use it as Level 3.
5. The prompt-space HTML contains all nested metadata, but its visualization reads legacy top-level `cate_idx/l2/l3/l4/region` keys. Those are null, so every tooltip shows blank L2/L3/L4 values and the legend collapses to `safety_harmful`.
6. Official category-specific judge prompts are a separate official dataset configuration. They are absent from the three inspected artifacts, so the generated pack continues to mark category-specific rubrics unavailable.

## Importer

The local-only importer validates both input schemas exactly, cross-checks every row and alias, rejects category conflicts, generates normalized prompt JSONL and an exhaustive taxonomy, records input hashes and transformations, and populates the pack's 314 category entries. It performs no network calls.

```sh
npm run import:airbench -- \
  --prompt-set /path/to/airbench_default_prompt_set.json \
  --validation /path/to/airbench_default_validation.jsonl
```
