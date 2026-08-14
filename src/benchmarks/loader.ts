import type { BenchmarkPack } from "../core/types";
import airBenchSkeleton from "../../benchmark-packs/air-bench-2024/pack.json";
import { validateBenchmarkPack } from "../generated/schemaValidators.js";

export class BenchmarkPackValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid benchmark pack: ${details.join("; ")}`);
    this.name = "BenchmarkPackValidationError";
  }
}

export function parseBenchmarkPack(value: unknown): BenchmarkPack {
  if (!validateBenchmarkPack(value)) {
    throw new BenchmarkPackValidationError(
      (validateBenchmarkPack.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  return structuredClone(value) as unknown as BenchmarkPack;
}

const bundledPacks: Readonly<Record<string, unknown>> = {
  "air-bench-2024": airBenchSkeleton,
};

export function loadBundledBenchmarkPack(id: string): BenchmarkPack {
  const rawPack = bundledPacks[id];
  if (!rawPack) throw new Error(`Unknown bundled benchmark pack: ${id}`);
  return parseBenchmarkPack(rawPack);
}
