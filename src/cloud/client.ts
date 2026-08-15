import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "./config";

let singleton: SupabaseClient | undefined;

/** Lazy by design: opening or importing a Local Workspace must make no Supabase request. */
export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const config = readSupabasePublicConfig();
  if (!config) throw new Error("Cloud Workspace has not been configured on this deployment.");
  singleton = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return singleton;
}

