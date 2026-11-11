# SafeFlow Human Validator

[![CI](https://github.com/safeflow-principle/validator/actions/workflows/ci.yml/badge.svg?branch=codex%2Fopen-source-release)](https://github.com/safeflow-principle/validator/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/safeflow-principle/validator)](https://github.com/safeflow-principle/validator/releases/tag/v0.1.0)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Current documented release:** [v0.1.0](https://github.com/safeflow-principle/validator/releases/tag/v0.1.0) · [License](LICENSE) · [Documentation](docs/) · [Configuration](docs/configuration.md) · [Independent deployment](docs/deployment.md) · [Known limitations](docs/limitations.md)

For a reproducible checkout, clone the tagged release:

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/safeflow-principle/validator.git
```

SafeFlow Human Validator is a local-first research application for independently evaluating automated LLM judges. It imports CSV, JSON, JSONL, or NDJSON datasets; keeps judge artifacts structurally separate during human annotation; autosaves drafts; supports evidence spans and resumable review; freezes an immutable human finalization; and requires a second, explicit action before producing a hash-linked human-versus-judge analysis.

The full validation exercise can run in a browser without an account, server, model API, telemetry service, or SafeFlow infrastructure. Optional Cloud Workspace features use a Supabase project controlled by the person deploying the application.

## What is included

- Local Workspace backed by browser IndexedDB, including import, mapping, preflight, annotation, review, backup/restore, finalization, deliberate unblinding, reliability reporting, and CSV/JSON export.
- AIR-BENCH 2024 benchmark-pack assets with field-level provenance and composite discrimination/privacy reference views.
- A separate 20-item AIR-BENCH practice course with fixed synthetic gold feedback.
- A 20-case synthetic end-to-end fixture with saved mock judge outputs, a separate completed answer key, and independently checked expected metrics.
- Optional authenticated Cloud Workspace migrations with Row Level Security for owners, researchers, and project-assigned validators.

## Fastest local start — no account or backend

Requirements: Node.js 22.12 or newer in the Node 22 line, npm 10, and (for Cloud Workspace) Docker Desktop plus Supabase CLI 2.122.1.

```sh
git clone https://github.com/safeflow-principle/validator.git
cd validator
npm ci
npm run dev
```

Open the Vite URL, normally <http://localhost:5173>. Choose **Local Workspace**, then either start the practice course or import [`fixtures/airbench-like-validation-20.csv`](fixtures/airbench-like-validation-20.csv). Local Workspace does not initialize the Supabase client and does not transmit the imported evaluation data.

## Reproduce the supplied validation example

1. Open **Validate a Dataset** and select [`fixtures/airbench-like-validation-20.csv`](fixtures/airbench-like-validation-20.csv).
2. Accept the suggested mappings for item ID, prompt, response, category, judge score, judge reasoning, and reference label.
3. Complete the 20 human annotations. To reproduce the fixed calculation exactly, use the separate [`fixtures/airbench-like-validation-20-answer-key.csv`](fixtures/airbench-like-validation-20-answer-key.csv).
4. Review and finalize the human annotations. Finalization does **not** reveal the mock judge.
5. Choose **Compare With Automated Judge**, acknowledge that the human labels are frozen, and deliberately unblind that finalization.
6. Compare the report with [`fixtures/airbench-like-validation-20-expected.json`](fixtures/airbench-like-validation-20-expected.json), then export the finalized CSV, analysis, or full `.safeflow.json` backup.

Expected headline results are `N=20`, 65% exact agreement, ordinary Cohen's κ `0.46360153256704967`, linearly weighted κ `0.5287958115183247`, MAE `0.225`, directional bias `0.075`, and two severe `0 ↔ 1` disagreements. All example content and outputs are synthetic; this reproduces saved inputs and calculations, not future model behavior.

## Run with an independent local Supabase backend

Additional requirement: Docker Desktop (or another running Docker-compatible daemon). The npm lockfile pins Supabase CLI `2.122.1`.

```sh
npm ci
npm run supabase:start
npm run local:env
npm run local:seed-users
npm run local:verify-rls
npm run dev
```

Open `/cloud` and use either disposable local identity printed by the seed command. The defaults are `owner@example.test` and `validator@example.test`, both with password `safeflow-local-demo`. These credentials exist only inside the loopback Supabase instance. Create a Local Workspace project, choose **Create Cloud Copy**, add/confirm the validator as a workspace `VALIDATOR`, and assign that validator from the cloud project page.

Stop the disposable stack with:

```sh
npm run supabase:stop
```

`npm run supabase:reset` is intentionally destructive and targets the local database by explicit `--local` flag. Never add `--linked` while following this guide.

See [docs/local-supabase.md](docs/local-supabase.md) for the two-user RLS checks and troubleshooting.

## Verification

```sh
npm test
npm run build
# or both:
npm run check
```

The build is a static Vite application in `dist/`. There are no server routes or remote model calls.

## Configuration and deployment

- [Configuration reference](docs/configuration.md)
- [Deploy to a fresh Supabase and Vercel project](docs/deployment.md)
- [Architecture](docs/architecture.md)
- [Privacy and trust boundaries](docs/local-privacy-model.md)
- [Judge-analysis methodology](docs/judge-analysis-methodology.md)
- [Supported analysis interface](docs/analysis-interface.md)
- [Known limitations](docs/limitations.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

The hosted SafeFlow instance is an optional convenience and is not required by this release. A fresh clone with no environment file remains entirely in Local Workspace mode.

## Licensing and provenance

Application code, original documentation, schemas, and SafeFlow-authored synthetic fixtures are available under [Apache-2.0](LICENSE). Generated AIR-BENCH prompt/taxonomy assets incorporate CC BY 4.0 material and retain separate attribution and transformation notes in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The license does not cover private evaluation runs, user-uploaded datasets, production records, or other material a user does not have the right to redistribute.

## Project status

This is research software. Blinding, immutability, and RLS reduce accidental leakage and workflow errors, but a person controlling the browser, source bundle, local database, or deployment can inspect or modify their own environment. Reliability metrics are descriptive and do not make a human annotation an adjudicated gold label.
