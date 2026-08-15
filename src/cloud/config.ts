export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

type PublicEnvironment = Partial<Record<"VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY" | "VITE_SUPABASE_ANON_KEY", string>>;

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

export function readSupabasePublicConfig(environment: PublicEnvironment = import.meta.env as unknown as PublicEnvironment): SupabasePublicConfig | undefined {
  const url = clean(environment.VITE_SUPABASE_URL);
  const publishableKey = clean(environment.VITE_SUPABASE_PUBLISHABLE_KEY) ?? clean(environment.VITE_SUPABASE_ANON_KEY);
  if (!url && !publishableKey) return undefined;
  if (!url || !publishableKey) throw new Error("Cloud Workspace is partially configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("VITE_SUPABASE_URL must be the HTTPS URL for a Supabase project.");
  }
  if (/service[_-]?role|sb_secret_/i.test(publishableKey)) {
    throw new Error("A Supabase secret/service-role key must never be used in browser configuration.");
  }
  return { url: parsed.origin, publishableKey };
}

export function cloudWorkspaceIsConfigured(environment?: PublicEnvironment): boolean {
  try { return Boolean(readSupabasePublicConfig(environment)); }
  catch { return false; }
}
