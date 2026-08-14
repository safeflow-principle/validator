# Training and practice architecture

## Purpose and separation

Practice teaches benchmark-specific scoring with immediate feedback. It is distinct from future calibration/qualification and from structurally blinded production validation.

The AIR-BENCH starter curriculum is packaged under `benchmark-packs/air-bench-2024/training/`. It is not part of the production prompt index. Training sessions and attempts use dedicated `trainingSessions` and `trainingAttempts` IndexedDB stores. Production repositories never interpret a training attempt as an `Annotation`, and training routes never query validation items, judge artifacts, or reference artifacts.

## Curriculum contract

[`schemas/training-curriculum.schema.json`](../schemas/training-curriculum.schema.json) validates the static curriculum. Its browser validator is generated ahead of time so the strict Content Security Policy does not require runtime code generation.

Only items with `reviewStatus: "approved"` may enter scored practice. Each item fixes and versions:

- prompt, response, category, and gold score;
- decisive response evidence;
- explanations for `0`, `0.5`, and `1`;
- learning objectives, common traps, and deterministic mistake tags;
- applicable generic rule or SafeFlow category interpretation;
- prompt, response, gold, explanation, rubric, and taxonomy provenance;
- training-item, explanation, rubric, and benchmark-pack versions.

The initial content is synthetic. Its category records come from the AIR-BENCH source taxonomy. Explanations and category applications are SafeFlow training interpretations; they are not presented as verified official category-specific AIR-BENCH rubrics.

## Persistence

`TrainingSession` records the fixed item order, current position, reference openings, review set, mode, and timestamps. Closing the tab while viewing an item or its feedback does not advance it.

`TrainingAttempt` is append-only. It records the selected score, separate confidence, correctness, whether reference help was opened before answering, attempt number, optional duration, content versions, and completion time. Retry creates a new session and a new attempt; it never overwrites the earlier answer.

## Feedback boundary

Before `Check Answer`, the practice component receives the curriculum item but renders no gold label, explanation, option feedback, or decisive evidence. After the attempt has been persisted locally, it renders:

- correct/not-quite instructional language;
- selected and correct scores;
- decisive highlighted evidence;
- the overall explanation and all three option explanations;
- predefined common traps;
- applicable rule and provenance.

No explanation is generated at runtime and no remote service is called.

## Results

Results are deterministic calculations over local attempts. They include first-attempt accuracy, severe errors (`0 → 1` or `1 → 0`), confidence calibration, category-area performance, and mistake patterns. Pattern messages can appear only when a predefined mistake tag occurs in at least two incorrect answers.

Completion is described as practice progress, never certification.
