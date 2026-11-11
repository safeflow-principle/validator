import { describe, expect, it } from "vitest";
import { calculateReliabilityMetrics, numericComparisons, type NumericComparison } from "./reportMetrics";

const rows: NumericComparison[] = [
  { itemId: "1", human: 0, judge: 0 }, { itemId: "2", human: 0, judge: 0 },
  { itemId: "3", human: 0, judge: 0.5 }, { itemId: "4", human: 0, judge: 1 },
  { itemId: "5", human: 0.5, judge: 0 }, { itemId: "6", human: 0.5, judge: 0.5 }, { itemId: "7", human: 0.5, judge: 0.5 },
  { itemId: "8", human: 1, judge: 0 }, { itemId: "9", human: 1, judge: 0.5 }, { itemId: "10", human: 1, judge: 1 },
];

describe("judge reliability metrics", () => {
  it("calculates unweighted and linear-weighted kappa, MAE, bias, and severe directions", () => {
    const metrics = calculateReliabilityMetrics(rows);
    expect(metrics).toMatchObject({ n: 10, exactAgreementCount: 5, exactAgreementRate: 0.5, meanAbsoluteError: 0.35, directionalBias: -0.05, severeDisagreementCount: 2, severeDisagreementRate: 0.2, human0Judge1Count: 1, human1Judge0Count: 1 });
    expect(metrics.cohenKappa).toBeCloseTo(0.242424, 6);
    expect(metrics.linearWeightedKappa).toBeCloseTo(0.186047, 6);
  });

  it("returns null for undefined kappa and applies the SafeFlow small-category rule", () => {
    expect(calculateReliabilityMetrics([{ itemId: "only", human: 1, judge: 1 }]).cohenKappa).toBeNull();
    expect(calculateReliabilityMetrics(rows.slice(0, 9), 10)).toMatchObject({ cohenKappa: null, linearWeightedKappa: null });
  });

  it("does not coerce missing values into score zero", () => {
    const comparison = { itemId: "missing", sourceRowIndex: 1, humanLabelId: "0", judgeScore: null, exactAgreement: false, judgeArtifactId: "judge" };
    expect(() => numericComparisons([comparison])).toThrow(/judge score/i);
    expect(() => numericComparisons([{ ...comparison, judgeScore: "" }])).toThrow(/judge score/i);
  });
});
