# Contributing

Contributions that improve reproducibility, privacy, blinding, accessibility, benchmark-pack portability, or test coverage are welcome.

1. Create a branch from the current default branch.
2. Install exact dependencies with `npm ci`.
3. Keep imported evaluation data, credentials, `.env.local`, Supabase link state, and owner-only study files out of commits.
4. Add or update tests for behavior changes.
5. Run `npm run check` before opening a pull request.

Do not weaken structural blinding to simplify a component. Annotation routes must not retrieve judge reasoning, judge scores, reference labels, or other validators' annotations before the applicable finalized/unblinded state. New network dependencies must document exactly what is transmitted and must not silently change Local Workspace privacy.

By intentionally submitting a contribution, you agree that it is provided under the repository's Apache-2.0 license, consistent with Section 5 of that license. Do not submit material you do not have the right to contribute.
