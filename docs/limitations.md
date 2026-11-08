# Known limitations

- Local-first means the person controlling the browser profile, source bundle, or local database can inspect or modify their own data. Structural blinding prevents ordinary UI data flow; it is not protection from a hostile deployment owner.
- IndexedDB is origin- and browser-profile-specific. Clearing site data can destroy local records unless the user exports a backup.
- Local backups are not encrypted. Treat `.safeflow.json` and CSV exports as potentially sensitive research data.
- The included example reproduces saved synthetic inputs and deterministic calculations; it does not claim repeatability of future model outputs.
- AIR-BENCH category-specific official human rubrics were not present in the inspected source artifacts. The UI says so rather than generating them.
- A single human annotation is not adjudicated ground truth. Multi-validator adjudication and human-human reliability are not implemented.
- Category κ is suppressed below `n=10`; confidence intervals are not implemented.
- Cloud Workspace supports shared import, membership/assignment, blinded annotation, and human-only review. Cloud finalization, unblinding/report UI, backup/restore, and export are not yet feature-equivalent with Local Workspace.
- Hosted email delivery, domain configuration, service availability, and account costs belong to the deployer's Supabase/Vercel providers.
- No formal accessibility audit, penetration test, or comprehensive third-party security audit has been completed.
- The current import bundle is large because the normalized AIR-BENCH prompt index is bundled for offline hydration.
