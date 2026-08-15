import { describe, expect, it } from "vitest";
import { cloudWorkspaceIsConfigured, readSupabasePublicConfig } from "./config";

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
});

