# Third-party materials

SafeFlow Human Validator application code, original documentation, schemas, and SafeFlow-authored synthetic examples are distributed under the [Apache License 2.0](LICENSE).

The generated AIR-BENCH prompt index and source taxonomy under `benchmark-packs/air-bench-2024/generated/` incorporate and normalize fields from **AIR-BENCH 2024**, distributed by Stanford CRFM under the [Creative Commons Attribution 4.0 International license](https://creativecommons.org/licenses/by/4.0/). The upstream dataset is available at <https://huggingface.co/datasets/stanford-crfm/air-bench-2024> and is described in Zeng et al., *AIR-Bench 2024: A Safety Benchmark Based on Regulation and Policies Specified Risk Categories* (<https://arxiv.org/abs/2407.17436>).

SafeFlow modifications include normalized JSON/JSONL serialization, content hashes, explicit source-field provenance, the paper-to-dataset Level 1 mapping, a separate 45-node conceptual Level 3 representation, and deterministic composite-axis decoding for source encodings `3940` and `4142`. See `benchmark-packs/air-bench-2024/generated/source-manifest.json` and `docs/airbench-artifact-audit.md`.

The repository does not license or redistribute private evaluation runs, production datasets, user annotations, customer data, or owner-only study imports. Files created by users through import, annotation, backup, or export remain subject to their original rights and applicable third-party terms.

Runtime packages retain their own licenses. Their exact resolved versions are recorded in `package-lock.json`.
