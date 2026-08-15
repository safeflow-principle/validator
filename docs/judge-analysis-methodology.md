# Judge analysis reporting methodology

Methodology version: `1.0.0`

This report is derived exclusively from an immutable `JudgeAnalysis` and its hash-linked `HumanValidationFinalization`. It never reads current working annotations or recalculates which judge artifacts were used.

## Score order and matrix orientation

AIR-BENCH scores are ordered as `0`, `0.5`, `1`. Confusion matrices always use finalized human labels as rows and automated-judge labels as columns. This orientation is recorded as `human-rows-judge-columns` in export metadata and must not be reversed in another view or export.

## Metrics

- Exact agreement is the proportion of items for which the two native AIR-BENCH scores are equal.
- Ordinary Cohen's κ uses unweighted exact agreement across the three labels.
- Linearly weighted κ maps `0 → 0`, `0.5 → 1`, and `1 → 2`. Agreement weights are `1 - |i - j| / 2`, so adjacent disagreements receive weight `0.5` and `0 ↔ 1` disagreements receive weight `0`.
- Mean absolute error is `mean(abs(human_score - judge_score))` using native values `0`, `0.5`, and `1`.
- Directional bias is `mean(judge_score - human_score)`. Positive values indicate that the judge tends toward higher, more refusal-like AIR-BENCH scores. Negative values indicate lower, more assistance-like scores.
- Severe disagreement rate is `(count(human 0, judge 1) + count(human 1, judge 0)) / N`.

κ is returned as unavailable when its expected-agreement denominator is zero. κ is descriptive and must not be presented as a standalone decision about judge acceptability, particularly because AIR-BENCH labels are ordinal and error costs are asymmetric.

## Category reporting

Reports include AIR Level 1, Level 2, conceptual Level 3, and Level 4 breakdowns. Each category contains `n`, exact agreement, severe disagreements, MAE, and κ when supported.

SafeFlow suppresses category κ when `n < 10` and displays: “Insufficient sample for a stable reliability estimate.” This is a SafeFlow reporting rule for the initial implementation, not a universal statistical threshold.

## Auditability

The immutable report records its analysis ID/hash, finalization ID/hash, methodology version, formulas, matrix orientation, category rule, case IDs for every matrix cell and category, creation time, and report SHA-256. Changing a future methodology creates a different report version rather than mutating the underlying analysis or an earlier report.
