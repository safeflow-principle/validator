import { describe, expect, it } from "vitest";
import { buildLocalImportBundle } from "./buildBundle";
import { parseDatasetText } from "./parser";
import { preflightDataset, suggestMapping } from "./preflight";

const categories = new Set(["1.1.1", "14.3940.4", "15.4142.55"]);

describe("local dataset import", () => {
  it("parses quoted multiline CSV and suggests common mappings", () => {
    const dataset = parseDatasetText("study.csv", 'prompt,response,category_id,judge_score\n"line one\nline two","safe, response",1.1.1,1\n');
    expect(dataset.issues).toEqual([]);
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0]).toMatchObject({ prompt: "line one\nline two", response: "safe, response" });
    expect(suggestMapping(dataset.columns)).toMatchObject({ prompt: "prompt", response: "response", categoryId: "category_id", judgeScore: "judge_score" });
  });

  it("preflights categories and removes blinded fields from item metadata", () => {
    const dataset = parseDatasetText("study.jsonl", [
      JSON.stringify({ id: "one", prompt: "p1", response: "r1", category: "14.3940.4", judge_score: 0, judge_reasoning: "hidden", reference_label: "safe", cohort: "A" }),
      JSON.stringify({ id: "two", prompt: "p2", response: "r2", category: "15.4142.55", judge_score: 1, judge_reasoning: "hidden two", reference_label: "safe", cohort: "B" }),
    ].join("\n"));
    const mapping = {
      prompt: "prompt", response: "response", externalId: "id", categoryId: "category",
      judgeScore: "judge_score", judgeReasoning: "judge_reasoning", referenceLabel: "reference_label",
    } as const;
    const preflight = preflightDataset(dataset, mapping, categories);
    expect(preflight.ready).toBe(true);
    expect(preflight.summary).toMatchObject({ sourceRows: 2, judgeArtifacts: 2, referenceArtifacts: 2, errors: 0 });
    expect(preflight.rows[0].metadata).toEqual({ cohort: "A" });
    expect(preflight.rows[0].judge).toEqual({ score: 0, reasoning: "hidden" });

    let sequence = 0;
    const bundle = buildLocalImportBundle(preflight, {
      projectName: "Study", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test",
      sourceName: "study.jsonl", format: "jsonl", mapping, now: "now", createId: () => `id-${sequence++}`,
    });
    expect(bundle.items).toHaveLength(2);
    expect(bundle.judgeArtifacts).toHaveLength(2);
    expect(bundle.referenceArtifacts).toHaveLength(2);
    expect(bundle.items[0].metadata).not.toHaveProperty("judge_reasoning");
    expect(JSON.stringify(bundle.items[0])).not.toContain("hidden");
  });

  it("blocks duplicate IDs, missing content, and unknown AIR-BENCH categories", () => {
    const dataset = parseDatasetText("study.json", JSON.stringify([
      { id: "same", prompt: "", response: "response", category: "not-real" },
      { id: "same", prompt: "prompt", response: "response", category: "1.1.1" },
    ]));
    const result = preflightDataset(dataset, { prompt: "prompt", response: "response", externalId: "id", categoryId: "category" }, categories);
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing-prompt", "unknown-category", "duplicate-external-id"]));
    expect(() => buildLocalImportBundle(result, {
      projectName: "blocked", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test",
      sourceName: "study.json", format: "json", mapping: {},
    })).toThrow(/preflight errors/);
  });
});
