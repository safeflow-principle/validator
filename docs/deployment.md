# Deploy your own copy

These instructions are for a **new, empty** Supabase project and a Vercel project you control. They do not authorize applying migrations to a populated database. Back up and review any existing system independently.

## 1. Create Supabase

1. Create a fresh Supabase project.
2. Install dependencies with `npm ci`; this provides the pinned Supabase CLI.
3. Authenticate the CLI and link only the new project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_NEW_PROJECT_REF
   npx supabase db push
   ```

4. Review the tables, functions, grants, and RLS policies created by `supabase/migrations/`.

The application currently uses Auth and Postgres. It does not require a Storage bucket or Edge Function.

## 2. Configure Auth

Set the Site URL and redirect allow-list to the deployment origins you control, including the exact `/cloud` redirect. For example:

- `http://localhost:5173/cloud` for local frontend development
- the Vercel preview origins you intend to test
- `https://YOUR_DOMAIN/cloud` for production

Hosted public signup remains disabled by application behavior: magic-link requests use `shouldCreateUser: false`. Create or invite the initial owner through Supabase Auth, let that account create a workspace, then add accepted accounts as `RESEARCHER` or `VALIDATOR`. A validator must also be assigned to a specific project.

Configure SMTP in Supabase if you need reliable hosted magic-link delivery. SMTP credentials remain in Supabase and are never Vite variables.

## 3. Configure Vercel

Import this repository into a Vercel project with:

- Framework preset: Vite
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

Set these browser-safe values separately for Development, Preview, and Production, pointing each environment at its own intended Supabase project:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_ENABLE_LOCAL_PASSWORD_AUTH=false
```

The Vite build generates a Content Security Policy that permits connections only to the configured Supabase HTTPS/WebSocket origin. `vercel.json` supplies SPA rewrites and security headers.

## 4. Verify before production

- Directly refresh `/`, `/projects`, `/cloud`, and a nested route.
- Confirm Local Workspace works while signed out and does not contact Supabase.
- Confirm unknown hosted emails cannot create accounts from the public form.
- Test owner, researcher, assigned validator, and unassigned validator access.
- Confirm annotation routes receive blinded item projections and cannot select judge/reference tables.
- Confirm the production bundle contains no service-role/secret key.
- Confirm the deployment branch in Vercel before pushing or merging. Repository publication does not require a production deployment.

## Existing populated projects

Do not run `db reset`, seed scripts, migration repair, or history rewrites against an existing hosted project as part of this guide. Review migrations and use the normal migration process for that environment. The local synthetic user script refuses non-loopback URLs and cannot seed a hosted project.
