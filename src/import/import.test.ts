import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { buildLocalImportBundle } from "./buildBundle";
import { parseDatasetText } from "./parser";
import { preflightDataset, suggestMapping } from "./preflight";

const categories = new Set(["1.1.1", "14.3940.4", "15.4142.55"]);
const options = { knownCategoryIds: categories };

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
    const preflight = preflightDataset(dataset, mapping, options);
    expect(preflight.ready).toBe(true);
    expect(preflight.summary).toMatchObject({ sourceRows: 2, judgeArtifacts: 2, referenceArtifacts: 2, errors: 0 });
    expect(preflight.rows[0].metadata).toEqual({ cohort: "A" });
    expect(preflight.rows[0].judge).toEqual({ score: 0, reasoning: "hidden" });

    let sequence = 0;
    const bundle = buildLocalImportBundle(preflight, {
      projectName: "Study", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test",
      sourceName: "study.jsonl", sourceSha256: "a".repeat(64), format: "jsonl", mapping, now: "now", createId: () => `id-${sequence++}`,
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
    const result = preflightDataset(dataset, { prompt: "prompt", response: "response", externalId: "id", categoryId: "category" }, options);
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing-prompt", "unknown-category", "duplicate-external-id"]));
    expect(() => buildLocalImportBundle(result, {
      projectName: "blocked", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test",
      sourceName: "study.json", sourceSha256: "b".repeat(64), format: "json", mapping: {},
    })).toThrow(/preflight errors/);
  });

  it("hydrates missing prompt metadata from a recognized AIR-BENCH prompt ID", () => {
    const promptIndex = new Map([["1.1.1::0", { promptId: "1.1.1::0", canonicalId: "air:1.1.1::0", text: "Canonical prompt", categoryId: "1.1.1" }]]);
    const dataset = parseDatasetText("hydrated.json", JSON.stringify([{ prompt_id: "1.1.1::0", response: "model response" }]));
    const result = preflightDataset(dataset, { benchmarkPromptId: "prompt_id", response: "response" }, { knownCategoryIds: categories, promptIndex });
    expect(result.ready).toBe(true);
    expect(result.rows[0]).toMatchObject({
      prompt: "Canonical prompt",
      categoryId: "1.1.1",
      fieldProvenance: { benchmarkPromptId: "uploaded-source", prompt: "air-bench-benchmark-asset", categoryId: "air-bench-benchmark-asset", taxonomy: "safeflow-derived-mapping" },
    });
  });

  it("blocks explicit values that conflict with canonical prompt metadata", () => {
    const promptIndex = new Map([["known", { promptId: "known", canonicalId: "air:known", text: "Canonical prompt", categoryId: "1.1.1" }]]);
    const dataset = parseDatasetText("conflict.json", JSON.stringify([{ prompt_id: "known", prompt: "Different prompt", category: "14.3940.4", response: "response" }]));
    const result = preflightDataset(dataset, { benchmarkPromptId: "prompt_id", prompt: "prompt", categoryId: "category", response: "response" }, { knownCategoryIds: categories, promptIndex });
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["canonical-prompt-conflict", "canonical-category-conflict"]));
  });

  it("keeps unknown prompt IDs usable only with explicit prompt and category data", () => {
    const sufficient = parseDatasetText("unknown.json", JSON.stringify([{ prompt_id: "unknown", prompt: "Explicit prompt", category: "1.1.1", response: "response" }]));
    const usable = preflightDataset(sufficient, { benchmarkPromptId: "prompt_id", prompt: "prompt", categoryId: "category", response: "response" }, { knownCategoryIds: categories, promptIndex: new Map() });
    expect(usable.ready).toBe(true);
    expect(usable.issues).toContainEqual(expect.objectContaining({ code: "unknown-benchmark-prompt-id", severity: "warning" }));

    const insufficient = parseDatasetText("unknown.json", JSON.stringify([{ prompt_id: "unknown", response: "response" }]));
    const blocked = preflightDataset(insufficient, { benchmarkPromptId: "prompt_id", response: "response" }, { knownCategoryIds: categories, promptIndex: new Map() });
    expect(blocked.ready).toBe(false);
  });

  it("preflights the realistic 20-row AIR-BENCH-like fixture", async () => {
    const contents = await readFile(resolve("fixtures/airbench-like-validation-20.csv"), "utf8");
    const dataset = parseDatasetText("airbench-like-validation-20.csv", contents);
    const mapping = suggestMapping(dataset.columns);
    const pack = loadBundledBenchmarkPack("air-bench-2024");
    const result = preflightDataset(dataset, mapping, { knownCategoryIds: new Set(pack.categories.map((category) => category.id)) });
    expect(mapping).toMatchObject({ externalId: "external_id", prompt: "prompt", response: "response", categoryId: "category_id", judgeScore: "judge_score", judgeReasoning: "judge_reasoning", referenceLabel: "reference_label" });
    expect(result.ready).toBe(true);
    expect(result.summary).toMatchObject({ sourceRows: 20, validRows: 20, categorizedRows: 20, judgeArtifacts: 20, referenceArtifacts: 20, errors: 0 });
  });
});
