import Ajv2020 from "ajv/dist/2020.js";
import type { BenchmarkPack } from "../core/types";
import schema from "../../schemas/benchmark-pack.schema.json";
import airBenchSkeleton from "../../benchmark-packs/air-bench-2024/pack.json";

export class BenchmarkPackValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid benchmark pack: ${details.join("; ")}`);
    this.name = "BenchmarkPackValidationError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { uri: true } });
const validate = ajv.compile(schema);

export function parseBenchmarkPack(value: unknown): BenchmarkPack {
  if (!validate(value)) {
    throw new BenchmarkPackValidationError(
      (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  return structuredClone(value) as BenchmarkPack;
}

const bundledPacks: Readonly<Record<string, unknown>> = {
  "air-bench-2024": airBenchSkeleton,
};

export function loadBundledBenchmarkPack(id: string): BenchmarkPack {
  const rawPack = bundledPacks[id];
  if (!rawPack) throw new Error(`Unknown bundled benchmark pack: ${id}`);
  return parseBenchmarkPack(rawPack);
}
