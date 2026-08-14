import type { NormalizedBenchmarkPrompt } from "../core/types";
import type { BenchmarkPromptHydrationRecord } from "../import/types";

export type BenchmarkPromptIndex = ReadonlyMap<string, BenchmarkPromptHydrationRecord>;

export function buildBenchmarkPromptIndex(prompts: readonly NormalizedBenchmarkPrompt[]): BenchmarkPromptIndex {
  const index = new Map<string, BenchmarkPromptHydrationRecord>();
  for (const prompt of prompts) {
    const record = {
      promptId: prompt.llmEvalClean.promptId,
      canonicalId: prompt.id,
      text: prompt.text,
      categoryId: prompt.categoryId,
    };
    for (const key of [prompt.id, prompt.llmEvalClean.promptId]) {
      const existing = index.get(key);
      if (existing && existing.canonicalId !== record.canonicalId) throw new Error(`Benchmark prompt alias is not unique: ${key}`);
      index.set(key, record);
    }
  }
  return index;
}

export function parseNormalizedPromptJsonl(raw: string): NormalizedBenchmarkPrompt[] {
  return raw.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as NormalizedBenchmarkPrompt);
}
