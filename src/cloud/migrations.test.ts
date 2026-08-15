import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "supabase/migrations/202608140001_cloud_workspaces.sql"), "utf8");
const operations = readFileSync(resolve(process.cwd(), "supabase/migrations/202608140002_cloud_operations.sql"), "utf8");

describe("cloud database security migrations", () => {
  it("enables RLS on every exposed research table", () => {
    for (const table of ["workspaces", "workspace_members", "projects", "project_assignments", "validation_items", "annotations", "reference_artifacts", "judge_artifacts", "human_validation_finalizations", "human_finalization_items", "judge_analyses", "judge_analysis_items", "judge_analysis_reports", "audit_events"]) {
      expect(schema).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("gives validators no judge, reference-label, analysis, or report policy path", () => {
    const protectedPolicyBlock = schema.slice(schema.indexOf("-- Validator is intentionally absent"));
    expect(protectedPolicyBlock).not.toMatch(/VALIDATOR[^\n]*(judge|reference|analys|report)/i);
    expect(schema).toContain("validator_id = auth.uid()");
  });

  it("uses owner-only atomic functions for immutable transitions", () => {
    expect(operations).toContain("function public.finalize_human_validation");
    expect(operations).toContain("function public.create_judge_analysis");
    expect(operations).toContain("function public.create_judge_analysis_report");
    expect(operations.match(/Owner access required/g)?.length).toBeGreaterThanOrEqual(6);
    expect(schema).toMatch(/revoke insert, update, delete on public\.human_validation_finalizations/);
  });
});
