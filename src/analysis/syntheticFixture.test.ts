import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDatasetText } from "../import/parser";
import { calculateReliabilityMetrics } from "./reportMetrics";

describe("synthetic completed validation fixture", () => {
  it("reproduces the published expected reliability metrics", () => {
    const dataset = parseDatasetText("airbench-like-validation-20.csv", readFileSync(resolve("fixtures/airbench-like-validation-20.csv"), "utf8"));
    const answers = parseDatasetText("airbench-like-validation-20-answer-key.csv", readFileSync(resolve("fixtures/airbench-like-validation-20-answer-key.csv"), "utf8"));
    const expected = JSON.parse(readFileSync(resolve("fixtures/airbench-like-validation-20-expected.json"), "utf8")) as { confusionMatrix: number[][]; metrics: Record<string, number> };
    const judgeById = new Map(dataset.rows.map((row) => [String(row.external_id), Number(row.judge_score)]));
    const rows = answers.rows.map((row) => ({ itemId: String(row.external_id), human: Number(row.human_score) as 0 | 0.5 | 1, judge: judgeById.get(String(row.external_id)) as 0 | 0.5 | 1 }));
    const metrics = calculateReliabilityMetrics(rows);
    expect(metrics).toEqual(expected.metrics);
    const labels = [0, 0.5, 1] as const;
    const matrix = labels.map((human) => labels.map((judge) => rows.filter((row) => row.human === human && row.judge === judge).length));
    expect(matrix).toEqual(expected.confusionMatrix);
  });
});
