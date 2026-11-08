# Configuration reference

Local Workspace needs no environment variables. If no Supabase variables are present, Cloud Workspace is unavailable and the application does not construct a Supabase client.

All supported variables are Vite build-time browser variables. Their values are visible in the compiled JavaScript and must never contain a privileged credential.

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Cloud only | Browser/build | HTTPS URL of the deployer's Supabase project, or a loopback URL for local development. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloud only | Browser/build | Supabase publishable key. RLS—not key secrecy—is the authorization boundary. |
| `VITE_SUPABASE_ANON_KEY` | Legacy alternative | Browser/build | Accepted only when the publishable key variable is absent. Do not set both. |
| `VITE_ENABLE_LOCAL_PASSWORD_AUTH` | Optional | Browser/build | Enables email/password creation and sign-in only when the configured Supabase hostname is `127.0.0.1` or `localhost`. It is ignored for hosted URLs. |

The application rejects `service_role`, `sb_secret_…`, and non-Supabase hosted URLs in browser configuration. There are no application-server, Edge Function, analytics, model-provider, or SafeFlow API variables.

## Local values

After `npm run supabase:start`, run `npm run local:env`. The script reads the local CLI status, verifies that the API URL is loopback-only, writes `.env.local` with mode `0600`, and does not print the key. `.env.local` and Supabase link state are ignored by Git.

## Hosted values

Copy `.env.example` to `.env.local` and replace the two placeholders with values from a Supabase project you control. Keep `VITE_ENABLE_LOCAL_PASSWORD_AUTH=false`. For Vercel, configure the same variables in Project Settings rather than committing an environment file.

Supabase publishable and legacy anon keys are deliberately browser-visible. Database passwords, service-role/secret keys, SMTP credentials, access tokens, and Vercel tokens are privileged and must remain in their respective service settings or local CLI state.
