# Cloud deployment setup

This guide is intentionally sequential. Complete one checkpoint at a time. Local Workspace continues to work even when no cloud settings are present.

## Safety rules

- Never put a Supabase `service_role`, `sb_secret_…`, database password, personal access token, or Vercel token in a `VITE_…` variable.
- Never paste those secrets into an issue, commit, screenshot, or chat.
- The browser uses only the Supabase project URL and publishable key. Row Level Security is the authorization boundary.
- Public sign-up remains disabled. The initial owner and invited collaborators are created through controlled invitations.

## Checkpoint 1 — create the Supabase project

1. Sign in to Supabase and choose **New project**.
2. Choose the organization you created for SafeFlow.
3. Name the project `safeflow-validator-production`.
4. Generate a strong database password and save it in a password manager. It is not needed by the frontend.
5. Select the region closest to the expected research team and create the project.
6. Wait until the project reports that it is healthy.

For a separate development environment, repeat later with `safeflow-validator-development`. Do not use production credentials in automated tests.

## Checkpoint 2 — apply database migrations

The migration files are in `supabase/migrations/`. The preferred repeatable path is the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Enter the database password only at the CLI prompt. Do not save it in this repository. Confirm in **Database → Tables** that the workspace and research tables exist.

## Checkpoint 3 — configure authentication

1. Open **Authentication → URL Configuration**.
2. Set the Site URL to the temporary Vercel production URL initially. Replace it with `https://validator.safeflow.app` after the domain is connected.
3. Add redirect URLs for `http://localhost:5173/cloud`, the Vercel preview pattern you intend to use, and `https://validator.safeflow.app/cloud`.
4. Keep open public sign-up disabled.
5. In **Authentication → Users**, invite the initial owner email.
6. After accepting that email, sign into SafeFlow and create the first workspace.

The application requests email magic links with `shouldCreateUser: false`; an unknown email cannot create an account through the public login form.

## Checkpoint 4 — configure local public values

Copy `.env.example` to `.env.local` and replace only these two values:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Both values are available under the Supabase project's API settings. The publishable key is intended for browser use; authorization still comes from Auth and RLS. Restart `npm run dev` after changing `.env.local`.

## Checkpoint 5 — create the Vercel project

1. In Vercel, choose **Add New → Project** and import the SafeFlow validator repository.
2. Keep Framework Preset as **Vite**, Build Command as `npm run build`, and Output Directory as `dist`.
3. Add the same two public environment variables separately for Development, Preview, and Production, pointing each environment at its matching Supabase project.
4. Deploy and verify `/`, `/projects`, and `/cloud` directly (including a browser refresh).
5. Add the temporary Vercel URL to Supabase Auth redirect URLs before testing email sign-in.

## Checkpoint 6 — custom domain

1. In the Vercel project, open **Settings → Domains** and add `validator.safeflow.app`.
2. Vercel will show the exact DNS record required, normally a CNAME for the `validator` subdomain.
3. Add that record in the DNS provider that hosts `safeflow.app`; do not alter the existing apex/main-site records.
4. Wait for Vercel to show the domain as valid and HTTPS as issued.
5. Update the Supabase Site URL and redirect allow-list to the final domain.

## Collaborator onboarding

For the first release, use **Supabase Authentication → Users → Invite user** to send the Auth invitation. Once the user has accepted, an owner can add that existing email to the SafeFlow workspace as `RESEARCHER`. This two-step flow avoids embedding an administrative Auth secret in the browser. A server-side invitation function that combines both steps is deferred.

## Finalized local project migration

The explicit **Create Cloud Copy** action verifies every local finalization, judge analysis, and report hash before making a single transactional archive-import call. The database preserves the immutable snapshot JSON and recorded hashes, checks the finalization → analysis → report references, and records a content-minimal migration event. The local project remains unchanged. Historical snapshot provenance may still say `localOnly: true`; that describes where the immutable artifact was originally created and is intentionally not rewritten because doing so would invalidate its hash.

## Verification checklist

- Local projects open while signed out and no request is made to Supabase.
- Cloud Workspace restores a signed-in session after refresh.
- Owner and researcher see only their workspace.
- The validator RLS test cannot select judge artifacts, reference labels, analyses, reports, or other annotations.
- Finalization, unblinding, and report creation use RPCs and produce audit events.
- Production JavaScript contains no service-role/secret key.
- The generated CSP permits only the configured Supabase HTTPS/WebSocket origin in addition to the app origin.
