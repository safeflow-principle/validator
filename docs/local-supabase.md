# Disposable local Supabase workflow

This workflow reconstructs the committed schema without contacting the hosted SafeFlow service. It was designed for Supabase CLI `2.75.0`, which is pinned in `package-lock.json`.

## Prerequisites

- Node.js 22.12 or newer in the Node 22 line and npm 10
- Docker Desktop or a compatible running Docker daemon
- Free local ports `55320` through `55324`

## Start and initialize

```sh
npm ci
npm run supabase:start
npm run local:env
npm run local:seed-users
npm run local:verify-rls
npm run dev
```

The first start applies every migration and `supabase/seed.sql`. `local:seed-users` then uses the service-role key returned by the **loopback** CLI solely to create two synthetic identities and a demo workspace. The key is not written to a Vite variable or printed.

Default disposable credentials:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@example.test` | `safeflow-local-demo` |
| Validator | `validator@example.test` | `safeflow-local-demo` |

Override them with `SAFEFLOW_DEMO_OWNER_EMAIL`, `SAFEFLOW_DEMO_VALIDATOR_EMAIL`, and `SAFEFLOW_DEMO_PASSWORD` when invoking the seed script. These are script inputs, not browser variables.

## Two-user authorization check

1. Sign in as the owner at `/cloud`; the seeded `SafeFlow Local Demo` workspace should appear.
2. In Local Workspace, import the synthetic fixture and create an explicit cloud copy.
3. Open that cloud project and assign `validator@example.test`.
4. In a separate private browser window, sign in as the validator. The assigned project should be visible and annotation should autosave.
5. Confirm the validator cannot read `judge_artifacts`, `reference_artifacts`, finalizations, analyses, reports, another validator's annotations, or an unassigned project. RLS should return no rows or an authorization error.
6. Confirm Local Workspace remains usable while signed out and makes no Supabase request.

The current Cloud Workspace UI covers shared import, assignment, blinded annotation, and human-only review. Immutable finalization, deliberate unblinding, reliability reports, and portable backup/export are complete in Local Workspace; equivalent cloud finalization/report UI remains a documented limitation.

## Reset and stop

```sh
npm run supabase:reset   # destructive to the disposable local database only
npm run local:seed-users
npm run supabase:stop
```

The reset script includes `--local`. Do not add `--linked`, `--db-url`, or a production project reference. Removing `supabase/.temp/` only removes generated local link/status state; it is ignored by Git.

Local Auth email is captured by the local mail service at <http://127.0.0.1:55324>, but the provided password path does not require email delivery.
