# Explicit judge unblinding and immutable analysis

`HUMAN_FINALIZED` remains structurally blinded. The finalized-human route reads only the human snapshot store, and simply opening that route does not retrieve judge artifacts.

The researcher must choose **Compare With Automated Judge**, review a warning that human labels are frozen, and explicitly acknowledge unblinding. Only then does SafeFlow read the judge-artifact store for the item IDs in that exact finalization.

The transition is:

`HumanFinalization HF-123 + exact JudgeArtifact set → JudgeAnalysis JA-456 → UNBLINDED`

Each immutable `JudgeAnalysis` records:

- `finalizationId` and the verified human snapshot SHA-256;
- the selected `judgeId`;
- a full snapshot and SHA-256 for every judge artifact used;
- a deterministic SHA-256 for the ordered artifact set;
- item-level human and judge scores, judge reasoning, and exact agreement;
- an analysis SHA-256 and a content-minimal audit event.

Preparation hashes outside IndexedDB. Commit then re-reads the project, human finalization, and judge artifacts in one read/write transaction. If the project state, finalization hash, artifact identity, score, reasoning, metadata, or timestamps changed, the transaction aborts. Otherwise it adds the analysis, adds the audit event, and transitions the project to `UNBLINDED` atomically.

There is no judge-analysis update API. Later mutation of a source judge artifact cannot change an existing analysis snapshot. Annotation saving remains locked in both `HUMAN_FINALIZED` and `UNBLINDED`.

Derived statistics are stored separately as immutable `JudgeAnalysisReport` records. The analysis states what was compared; the report states what was calculated and under which methodology version. Methodology `1.0.0` is documented in [`judge-analysis-methodology.md`](judge-analysis-methodology.md).

The synthetic manual fixture [`fixtures/airbench-like-validation-20.csv`](../fixtures/airbench-like-validation-20.csv) contains 20 local-only prompts, responses, mock judge scores, and mock judge reasoning values. It supports the full import → annotate → finalize → explicitly unblind → compare workflow without using sensitive benchmark outputs. The separate [`airbench-like-validation-20-answer-key.csv`](../fixtures/airbench-like-validation-20-answer-key.csv) is a fixed completed example, not an adjudicated historical label set. [`airbench-like-validation-20-expected.json`](../fixtures/airbench-like-validation-20-expected.json) records the independently test-checked matrix and methodology `1.0.0` results.
