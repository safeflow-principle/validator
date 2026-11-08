import { execFileSync } from "node:child_process";

export function parseSupabaseStatus(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (match) values[match[1]] = match[2] ?? match[3] ?? match[4]?.trim() ?? "";
  }
  return values;
}

export function readLocalSupabaseStatus() {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const values = parseSupabaseStatus(output);
  const apiUrl = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY || values.SECRET_KEY;
  if (!apiUrl || !publishableKey) throw new Error("Local Supabase status did not return API_URL and a publishable/anon key.");
  const url = new URL(apiUrl);
  if (!(["127.0.0.1", "localhost"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol))) {
    throw new Error("Refusing to use a non-loopback Supabase instance for local setup.");
  }
  return { apiUrl: url.origin, publishableKey, serviceRoleKey };
}
