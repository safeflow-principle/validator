# Local privacy model

## Promise and workspace choice

In **Local Workspace**, uploaded prompts, model responses, automated-judge outputs, annotations, reference artifacts, and associated metadata remain in the user's browser. Local routes do not initialize the Supabase client and contain no evaluation-data upload path.

**Cloud Workspace** is a separate, explicit mode. When configured and selected, it sends project data to the deployer's Supabase project so authorized workspace members can collaborate. A fresh clone has no cloud destination, and the open-source release contains no fallback connection to SafeFlow infrastructure.

## Data locations

- Runtime state: browser memory for the active view.
- Durable state: IndexedDB database `safeflow-human-validator` on the current browser profile and origin.
- Application assets: locally served JavaScript and CSS bundles.
- Dataset import: browser `File.text()` into memory, followed by explicit IndexedDB persistence after preflight.
- Optional cloud data: the independently configured Supabase Postgres database, protected by Auth and Row Level Security.

There is no server-side file store, remote model call, telemetry SDK, remote logger, analytics tracker, error-reporting service, or external font request. Supabase is used only after Cloud Workspace is configured and opened.

## Blinding boundary

During active human validation, the UI receives only:

- item ID and project ID;
- prompt and response;
- optional external ID and category ID;
- the selected benchmark pack;
- the current validator's annotation.

It does not receive judge scores or reasoning, reference labels, or other validators' annotations. These values use separate entity types and IndexedDB object stores. Real annotation and review routes call blinded item queries and local-validator-scoped annotation queries; they never join judge or reference stores. The annotation component has no props for hidden values. No CSS concealment is used.

The import pipeline creates `ValidationItem`, `JudgeArtifact`, and `ReferenceArtifact` records separately. Mapped judge reasoning, scores, and reference labels are never copied into validation-item metadata. Unmapped source metadata is persisted with the item for auditability, but `getBlindedItem()` excludes metadata structurally.

## Network policy

Local Workspace operations do not call a remote SDK. Cloud Workspace uses the Supabase browser client and therefore makes HTTPS/WebSocket requests to the single origin configured at build time. The HTML Content Security Policy restricts resources to the same origin plus that configured Supabase origin and disallows embedded objects. The Vite development server uses a same-origin development connection for hot reload; it does not receive or relay evaluation records.

Project backup and annotated CSV exports are generated from local IndexedDB records using in-browser `Blob` downloads. Restore reads the user-selected backup locally and performs no upload. Backup files contain evaluation data and should be handled as sensitive local files. Within the JSON format, judge and reference artifacts remain structurally separated from the resumable annotation workflow; after restore they return to their isolated IndexedDB stores. Annotated CSV export never reads those artifact stores.

Human Validation Finalization does not weaken blinding. Snapshot preparation and atomic commit transact only over project, item, local annotation, import, benchmark-pack, finalization, and audit stores. Judge and reference stores are not opened. `HUMAN_FINALIZED` freezes the human side but does not unblind the automated judge. Finalized results and finalized CSV read the immutable human snapshot only.

In Local Workspace, judge data crosses that boundary only after the researcher chooses **Compare With Automated Judge** and acknowledges the warning for a specific finalization. That action atomically creates an immutable, locally hashed analysis and transitions the project to `UNBLINDED`. Reference artifacts remain outside the comparison. Cloud parity for this finalization/report UI is not yet implemented.

Reliability reports are derived locally from that immutable analysis and its hash-linked human finalization. Report generation does not reopen source judge artifacts, current annotations, or reference artifacts.

Training content is a bundled static benchmark-pack asset. Training sessions, reference-open flags, confidence, and append-only attempts remain in separate local IndexedDB stores. They are not telemetry and are never transmitted. Immediate practice feedback intentionally reveals the packaged gold answer only after a local attempt is saved; production annotation routes remain structurally blinded and do not query training stores.

This repository does not attempt to protect against a compromised browser, malicious browser extensions, operating-system malware, a hostile origin serving modified bundles, a deployment owner, or a person with access to the unlocked browser profile. Local-first limits transmission; it is not endpoint encryption.

## Browser-origin caveat

IndexedDB is scoped to a browser origin. Running the app under a different hostname, port, or protocol creates a different data silo. Clearing site data or the browser profile can permanently remove records. Local backup/restore is implemented, including finalized-snapshot integrity verification, but automatic backup, encryption at rest, and remote recovery are not.

## Privacy review checklist for future changes

Before merging a dependency or feature:

1. Confirm it makes no network request with evaluation data.
2. Confirm annotation routes are given only blinded view models.
3. Search rendered DOM tests for judge reasoning and reference labels.
4. Keep remote fonts, CDNs, analytics, telemetry, and remote logging absent.
5. Document any new IndexedDB store and migration.
6. Treat exports as explicit user-initiated downloads, never background sync.
