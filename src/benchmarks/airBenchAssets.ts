import promptJsonl from "../../benchmark-packs/air-bench-2024/generated/prompts.jsonl?raw";
import { buildBenchmarkPromptIndex, parseNormalizedPromptJsonl } from "./promptIndex";

export const airBenchPromptIndex = buildBenchmarkPromptIndex(parseNormalizedPromptJsonl(promptJsonl));
