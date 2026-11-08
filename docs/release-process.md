# Source release process

1. Work on a non-production release branch and preserve unrelated working-tree changes.
2. Review current-tree and reachable-history scans without printing secret values. Exclude private fixtures and generated account-link state.
3. Confirm the Vercel production branch and repository automation before pushing. Publishing source must not require merging the production branch.
4. Run `npm ci`, `npm run check`, and the disposable local Supabase workflow.
5. From a clean checkout, complete the synthetic import → annotate → reload → finalize → deliberately unblind → report → export path.
6. Verify two-user RLS with an owner and assigned validator on the disposable local instance.
7. Commit reviewed files, push the release branch, obtain review, and tag the verified commit using the existing version convention (initial release: `v0.1.0`).
8. Create a concise GitHub release noting setup, license scope, checks, and limitations.
9. Verify the repository, release, and source archive anonymously; clone the exact tag with credential helpers disabled and repeat the smoke workflow.
10. Check the existing hosted website read-only. Do not change its deployment or database merely to publish source.

If repository permissions, confidential history, or metadata prevent safe publication, create a clean public repository from the reviewed release tree. Record exactly which history and surfaces were not published.
