import { chmodSync, writeFileSync } from "node:fs";
import { readLocalSupabaseStatus } from "./local-supabase-env.mjs";

const { apiUrl, publishableKey } = readLocalSupabaseStatus();
const contents = [
  "# Generated for the disposable local Supabase instance. Do not commit this file.",
  `VITE_SUPABASE_URL=${apiUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  "VITE_ENABLE_LOCAL_PASSWORD_AUTH=true",
  "",
].join("\n");
writeFileSync(".env.local", contents, { encoding: "utf8", mode: 0o600 });
chmodSync(".env.local", 0o600);
console.log("Wrote .env.local for the loopback Supabase instance (key not printed).");
