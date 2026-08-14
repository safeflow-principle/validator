# Local privacy model

## Promise

Uploaded prompts, model responses, automated-judge outputs, annotations, reference artifacts, and associated metadata remain in the user's browser. The application contains no code path that sends evaluation data to SafeFlow or a third party.

## Data locations

- Runtime state: browser memory for the active view.
- Durable state: IndexedDB database `safeflow-human-validator` on the current browser profile and origin.
- Application assets: locally served JavaScript and CSS bundles.

There is no cloud database, server-side file store, remote model call, telemetry SDK, remote logger, analytics tracker, error-reporting service, or external font request.

## Blinding boundary

During active human validation, the UI receives only:

- item ID and project ID;
- prompt and response;
- optional external ID and category ID;
- the selected benchmark pack;
- the current validator's annotation.

It does not receive judge scores or reasoning, reference labels, or other validators' annotations. These values use separate entity types and IndexedDB object stores. The annotation component has no props for them, and `getBlindedItem()` returns a newly constructed narrow object. No CSS concealment is used.

## Network policy

Production application code does not call `fetch`, `XMLHttpRequest`, `sendBeacon`, WebSocket APIs, or remote SDKs. The HTML content-security policy restricts resources to the same origin and disallows forms and embedded objects. The Vite development server uses a same-origin development connection for hot reload; it does not receive or relay evaluation records.

This repository does not attempt to protect against a compromised browser, malicious browser extensions, operating-system malware, a hostile origin serving modified bundles, or a person with access to the unlocked browser profile. Local-first limits transmission; it is not endpoint encryption.

## Browser-origin caveat

IndexedDB is scoped to a browser origin. Running the app under a different hostname, port, or protocol creates a different data silo. Clearing site data or the browser profile can permanently remove records. Export, backup, encryption-at-rest, and recovery workflows are not implemented in the skeleton and must be designed before collecting irreplaceable research data.

## Privacy review checklist for future changes

Before merging a dependency or feature:

1. Confirm it makes no network request with evaluation data.
2. Confirm annotation routes are given only blinded view models.
3. Search rendered DOM tests for judge reasoning and reference labels.
4. Keep remote fonts, CDNs, analytics, telemetry, and remote logging absent.
5. Document any new IndexedDB store and migration.
6. Treat exports as explicit user-initiated downloads, never background sync.
