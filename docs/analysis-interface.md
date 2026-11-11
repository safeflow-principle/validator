# Supported analysis interface

SafeFlow provides a deliberately narrow source-level analysis interface and command-line wrapper. It is intended for validated score pairs and for SafeFlow's immutable finalized artifacts. It is not a headless project database, storage API, or general npm package export.

## Score-record contract

Each human and judge record must contain:

- a non-empty item ID;
- exactly one AIR-BENCH score: numeric `0`, `0.5`, or `1`, or the strings `"0"`, `"0.5"`, or `"1"`.

Missing values, `null`, blank strings, booleans, other numeric strings, duplicate IDs, and mismatched human/judge ID sets are rejected. In particular, the interface never applies JavaScript's general `Number(value)` coercion to missing values; `null` and `""` are not legitimate score `0` judgments.

The module entry point is [`src/analysis/supportedInterface.ts`](../src/analysis/supportedInterface.ts):

```ts
import {
  analyzeScoreRecords,
  supportedAnalysisReportCsv,
  supportedAnalysisReportJson,
} from "./src/analysis/supportedInterface";

const report = analyzeScoreRecords(
  [{ itemId: "item-1", score: 1 }],
  [{ itemId: "item-1", score: 0.5 }],
);

const json = supportedAnalysisReportJson(report);
const csv = supportedAnalysisReportCsv(report);
```

## Command-line record mode

CSV and JSON inputs are supported. JSON must be an array, or an object with a `rows` or `items` array. The default fields are `item_id` and `score`; field flags make existing exports usable without rewriting them.

Run the fixed synthetic example:

```sh
npm run analyze -- \
  --human fixtures/airbench-like-validation-20-answer-key.csv \
  --judge fixtures/airbench-like-validation-20.csv \
  --human-id-field external_id \
  --judge-id-field external_id \
  --human-score-field human_score \
  --judge-score-field judge_score \
  --output /tmp/safeflow-analysis.json
```

Use `--output /tmp/safeflow-analysis.csv` or `--format csv` for CSV. When `--output` is omitted, the report is written to standard output.

The fixed fixture produces `N=20`, 65% exact agreement, unweighted Cohen's κ `0.46360153256704967`, linearly weighted κ `0.5287958115183247`, MAE `0.225`, directional bias `0.075`, and two severe `0 ↔ 1` disagreements.

## Finalized-artifact mode

Finalized-artifact mode accepts a `HumanValidationFinalization` JSON document and its linked immutable `JudgeAnalysis` JSON document:

```sh
npm run analyze -- \
  --finalization human-finalization.json \
  --analysis judge-analysis.json \
  --output report.json
```

Before calculating results, this mode:

1. validates both JSON schemas;
2. verifies the human snapshot SHA-256;
3. verifies every judge-artifact SHA-256, the artifact-set hash, and the judge-analysis hash;
4. confirms the analysis references the supplied finalization ID, project ID, and finalization hash;
5. recalculates from the human snapshot annotations and judge artifact snapshots rather than trusting stored comparison rows.

The output records the verified finalization, analysis, and artifact-set hashes. Any integrity failure stops analysis and produces no report.

## Calculations and CSV shape

The interface reuses SafeFlow methodology version `1.0.0` and reports:

- exact agreement count and rate;
- ordinary Cohen's κ;
- linear-distance weighted κ (not quadratic weighting);
- mean absolute error;
- directional bias as `mean(judge − human)`;
- severe `0 ↔ 1` disagreements and their direction;
- a human-row, automated-judge-column confusion matrix.

JSON contains the full report structure. CSV contains one row per item and repeats the report-level methodology, metrics, and—when applicable—verified finalization and judge-artifact hashes on each row so the file remains one rectangular, auditable table. Cells are quoted and spreadsheet-formula prefixes are neutralized.

This interface reads files supplied by the caller and writes only the requested output. It makes no network calls and does not read browser storage or a SafeFlow cloud workspace.
