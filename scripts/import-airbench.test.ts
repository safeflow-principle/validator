import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BenchmarkPack } from "../src/core/types";
import { importAirBenchSources, parsePromptSet } from "./import-airbench";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

function metadata() {
  return {
    data_split: "airbench_default_test", slice: "stress", category: "Security Risks", subcategory: "Confidentiality",
    workflow: "Network intrusion", intent: "1.1.1", expected_behavior: "refuse", original_source: "airbench",
    airbench_cate_idx: "1.1.1", airbench_l2: "Security Risks", airbench_l3: "Confidentiality",
    airbench_l4: "Network intrusion", airbench_region: "default", airbench_split: "test",
  };
}

function prompt(id: string, text: string) {
  return { id, text, prompt_type: "safety_harmful", source: "airbench2024", domain: "airbench_default", risk_level: "4", notes: null, metadata: metadata() };
}

function validation(prompt_id: string, text: string) {
  return {
    airbench_cate_idx: "1.1.1", airbench_l2: "Security Risks", airbench_l3: "Confidentiality",
    airbench_l4: "Network intrusion", airbench_region: "default", airbench_split: "test", category: "Security Risks",
    data_split: "airbench_default_test", expected_behavior: "refuse", intent: "1.1.1", origin_source: "airbench",
    prompt_id, risk_level: "", slice: "stress", source: "airbench", subcategory: "Confidentiality", text,
    workflow: "Network intrusion",
  };
}

const basePack: BenchmarkPack = {
  schemaVersion: "1.0", id: "air-bench-2024", name: "AIR-BENCH 2024", version: "skeleton",
  description: { kind: "unavailable", note: "fixture" },
  provenance: { benchmark: "AIR-BENCH", benchmarkVersion: "2024", notes: [] },
  categories: [],
  annotation: { instructions: [], fields: [{ id: "label", label: "Label", type: "boolean", required: true }] },
};

describe("AIR-BENCH source importer", () => {
  it("cross-validates both sources and produces deterministic normalized assets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "safeflow-airbench-"));
    temporaryDirectories.push(directory);
    const promptSetPath = join(directory, "prompt-set.json");
    const validationPath = join(directory, "validation.jsonl");
    const outputDirectory = join(directory, "generated");
    const packPath = join(directory, "pack.json");
    await Promise.all([
      writeFile(promptSetPath, JSON.stringify({ source: "airbench_default_test", domain: "airbench_default", prompts: [prompt("1.1.1::0", "one"), prompt("1.1.1::1", "two")] })),
      writeFile(validationPath, `${JSON.stringify(validation("1.1.1::0", "one"))}\n${JSON.stringify(validation("1.1.1::1", "two"))}\n`),
      writeFile(packPath, JSON.stringify(basePack)),
    ]);

    const result = await importAirBenchSources({ promptSetPath, validationPath, outputDirectory, packPath });
    expect(result).toMatchObject({ promptCount: 2, uniquePromptIds: 2, uniqueTexts: 2, taxonomyLeafCount: 1 });
    const taxonomy = JSON.parse(await readFile(result.outputs.taxonomy, "utf8"));
    expect(taxonomy.leaves[0]).toMatchObject({
      categoryId: "1.1.1",
      promptCount: 2,
      level1: { id: "1", name: "System & Operational Risks", authority: "official-air-2024-paper" },
      level4: { name: "Network intrusion", authority: "official-air-bench-dataset" },
    });
    const normalized = (await readFile(result.outputs.prompts, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(normalized[0]).toMatchObject({ categoryId: "1.1.1", llmEvalClean: { promptId: "1.1.1::0" } });
    expect(normalized[0].contentSha256).toHaveLength(64);
    const populatedPack = JSON.parse(await readFile(packPath, "utf8"));
    expect(populatedPack.categories[0].rubric.kind).toBe("unavailable");

    const firstPass = await Promise.all([
      readFile(result.outputs.prompts, "utf8"),
      readFile(result.outputs.taxonomy, "utf8"),
      readFile(result.outputs.manifest, "utf8"),
      readFile(packPath, "utf8"),
    ]);
    await importAirBenchSources({ promptSetPath, validationPath, outputDirectory, packPath });
    const secondPass = await Promise.all([
      readFile(result.outputs.prompts, "utf8"),
      readFile(result.outputs.taxonomy, "utf8"),
      readFile(result.outputs.manifest, "utf8"),
      readFile(packPath, "utf8"),
    ]);
    expect(secondPass).toEqual(firstPass);
  });

  it("rejects source schema drift instead of silently dropping fields", () => {
    const malformed = { source: "x", domain: "x", prompts: [{ ...prompt("id", "text"), unexpected: true }] };
    expect(() => parsePromptSet(JSON.stringify(malformed))).toThrow(/keys differ/);
  });
});
