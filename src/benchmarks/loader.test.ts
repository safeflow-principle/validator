import { describe, expect, it } from "vitest";
import { BenchmarkPackValidationError, loadBundledBenchmarkPack, parseBenchmarkPack } from "./loader";

describe("benchmark pack loader", () => {
  it("loads the bundled AIR-BENCH skeleton with unavailable official rubric", () => {
    const pack = loadBundledBenchmarkPack("air-bench-2024");
    expect(pack.categories[0].rubric.kind).toBe("unavailable");
  });

  it("rejects a malformed pack", () => {
    expect(() => parseBenchmarkPack({ schemaVersion: "1.0" })).toThrow(BenchmarkPackValidationError);
  });

  it("returns a clone so consumers cannot mutate the registry", () => {
    const first = loadBundledBenchmarkPack("air-bench-2024");
    first.name = "changed";
    expect(loadBundledBenchmarkPack("air-bench-2024").name).toBe("AIR-BENCH 2024");
  });
});
