import promptJsonl from "../../benchmark-packs/air-bench-2024/generated/prompts.jsonl?raw";
import taxonomyJson from "../../benchmark-packs/air-bench-2024/generated/taxonomy.json";
import type { NormalizedTaxonomyAsset } from "../core/types";
import { buildBenchmarkPromptIndex, parseNormalizedPromptJsonl } from "./promptIndex";

export const airBenchTaxonomy = taxonomyJson as NormalizedTaxonomyAsset;
export const airBenchPromptIndex = buildBenchmarkPromptIndex(parseNormalizedPromptJsonl(promptJsonl));
