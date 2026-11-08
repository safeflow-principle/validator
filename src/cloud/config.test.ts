import { describe, expect, it } from "vitest";
import { cloudWorkspaceIsConfigured, localPasswordAuthIsEnabled, readSupabasePublicConfig } from "./config";

describe("Supabase public configuration", () => {
  it("keeps Local Workspace available without cloud configuration", () => {
    expect(readSupabasePublicConfig({})).toBeUndefined();
    expect(cloudWorkspaceIsConfigured({})).toBe(false);
  });

  it("accepts only a complete browser-safe configuration", () => {
    expect(readSupabasePublicConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }))
      .toEqual({ url: "https://abc.supabase.co", publishableKey: "sb_publishable_test" });
    expect(() => readSupabasePublicConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co" })).toThrow(/both/);
  });

  it("rejects secret and service-role browser keys", () => {
    expect(() => readSupabasePublicConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_nope" })).toThrow(/must never/);
    expect(() => readSupabasePublicConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "service_role.nope" })).toThrow(/must never/);
  });

  it("accepts loopback Supabase and limits password auth to explicitly enabled local instances", () => {
    const local = { VITE_SUPABASE_URL: "http://127.0.0.1:55321", VITE_SUPABASE_PUBLISHABLE_KEY: "local-anon-key", VITE_ENABLE_LOCAL_PASSWORD_AUTH: "true" };
    expect(readSupabasePublicConfig(local)).toEqual({ url: "http://127.0.0.1:55321", publishableKey: "local-anon-key" });
    expect(localPasswordAuthIsEnabled(local)).toBe(true);
    expect(localPasswordAuthIsEnabled({ ...local, VITE_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
    expect(localPasswordAuthIsEnabled({ ...local, VITE_ENABLE_LOCAL_PASSWORD_AUTH: "false" })).toBe(false);
    expect(localPasswordAuthIsEnabled({ VITE_SUPABASE_URL: local.VITE_SUPABASE_URL, VITE_ENABLE_LOCAL_PASSWORD_AUTH: "true" })).toBe(false);
  });
});

