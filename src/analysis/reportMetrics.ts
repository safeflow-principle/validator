import { airBenchTaxonomy } from "../benchmarks/airBenchTaxonomy";
import type { FinalizedHumanAnnotation, HumanValidationFinalization } from "../finalization/types";
import type { JudgeAnalysis, JudgeItemComparison } from "./types";
import { AIR_BENCH_SCORE_ORDER, type AirBenchScore, type CategoryBreakdown, type ReliabilityMetrics, type TaxonomyBreakdownLevel } from "./reportTypes";

export interface NumericComparison { itemId: string; human: AirBenchScore; judge: AirBenchScore }

export function parseAirBenchScore(value: unknown, side: "human" | "judge", itemId: string): AirBenchScore {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && ["0", "0.5", "1"].includes(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  if (!AIR_BENCH_SCORE_ORDER.includes(numeric as AirBenchScore)) throw new Error(`${side} score for item ${itemId} is not an AIR-BENCH 0, 0.5, or 1 label.`);
  return numeric as AirBenchScore;
}

export function numericComparisons(comparisons: JudgeItemComparison[]): NumericComparison[] {
  return comparisons.map((comparison) => ({
    itemId: comparison.itemId,
    human: parseAirBenchScore(comparison.humanNumericValue ?? comparison.humanLabelId, "human", comparison.itemId),
    judge: parseAirBenchScore(comparison.judgeScore, "judge", comparison.itemId),
  }));
}

function kappa(rows: NumericComparison[], weighted: boolean): number | null {
  if (!rows.length) return null;
  const index = new Map<AirBenchScore, number>(AIR_BENCH_SCORE_ORDER.map((label, position) => [label, position]));
  const rowTotals = [0, 0, 0]; const columnTotals = [0, 0, 0];
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const row of rows) {
    const human = index.get(row.human)!; const judge = index.get(row.judge)!;
    matrix[human][judge] += 1; rowTotals[human] += 1; columnTotals[judge] += 1;
  }
  let observed = 0; let expected = 0;
  for (let human = 0; human < 3; human += 1) for (let judge = 0; judge < 3; judge += 1) {
    const agreementWeight = weighted ? 1 - Math.abs(human - judge) / 2 : human === judge ? 1 : 0;
    observed += agreementWeight * matrix[human][judge] / rows.length;
    expected += agreementWeight * (rowTotals[human] / rows.length) * (columnTotals[judge] / rows.length);
  }
  return Math.abs(1 - expected) < Number.EPSILON ? null : (observed - expected) / (1 - expected);
}

export function calculateReliabilityMetrics(rows: NumericComparison[], suppressKappaBelowN?: number): ReliabilityMetrics {
  const n = rows.length;
  const exactAgreementCount = rows.filter((row) => row.human === row.judge).length;
  const human0Judge1Count = rows.filter((row) => row.human === 0 && row.judge === 1).length;
  const human1Judge0Count = rows.filter((row) => row.human === 1 && row.judge === 0).length;
  const severeDisagreementCount = human0Judge1Count + human1Judge0Count;
  const allowKappa = suppressKappaBelowN === undefined || n >= suppressKappaBelowN;
  return {
    n,
    exactAgreementCount,
    exactAgreementRate: n ? exactAgreementCount / n : 0,
    cohenKappa: allowKappa ? kappa(rows, false) : null,
    linearWeightedKappa: allowKappa ? kappa(rows, true) : null,
    meanAbsoluteError: n ? rows.reduce((sum, row) => sum + Math.abs(row.human - row.judge), 0) / n : 0,
    directionalBias: n ? rows.reduce((sum, row) => sum + row.judge - row.human, 0) / n : 0,
    severeDisagreementCount,
    severeDisagreementRate: n ? severeDisagreementCount / n : 0,
    human0Judge1Count,
    human1Judge0Count,
  };
}

function conceptualLevel3(annotation: FinalizedHumanAnnotation): { id: string; name: string } {
  const leaf = airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === annotation.categoryId);
  if (!leaf) return { id: annotation.categoryId ?? "unavailable", name: annotation.taxonomyPath?.level3 ?? "Unavailable" };
  const relationship = leaf.conceptualLevel3;
  if (relationship.kind === "single") {
    const node = airBenchTaxonomy.conceptualLevel3Nodes.find((candidate) => candidate.id === relationship.nodeId);
    return { id: relationship.nodeId, name: node?.name ?? leaf.sourceLevel3.name };
  }
  const nodes = relationship.dimensions.map((dimension) => airBenchTaxonomy.conceptualLevel3Nodes.find((candidate) => candidate.id === dimension.nodeId));
  return { id: relationship.dimensions.map((dimension) => dimension.nodeId).join("×"), name: nodes.map((node) => node?.name ?? "Unavailable").join(" × ") };
}

function categoryFor(annotation: FinalizedHumanAnnotation, level: TaxonomyBreakdownLevel): { id: string; name: string } {
  const leaf = airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === annotation.categoryId);
  if (level === "level1") return leaf ? { id: leaf.level1.id, name: leaf.level1.name } : { id: "unavailable", name: annotation.taxonomyPath?.level1 ?? "Unavailable" };
  if (level === "level2") return leaf ? { id: leaf.level2.id, name: leaf.level2.name } : { id: "unavailable", name: annotation.taxonomyPath?.level2 ?? "Unavailable" };
  if (level === "level3") return conceptualLevel3(annotation);
  return leaf ? { id: leaf.level4.id, name: leaf.level4.name } : { id: annotation.categoryId ?? "unavailable", name: annotation.taxonomyPath?.level4 ?? "Unavailable" };
}

export function calculateCategoryBreakdowns(analysis: JudgeAnalysis, finalization: HumanValidationFinalization): CategoryBreakdown[] {
  const numericByItem = new Map(numericComparisons(analysis.comparisons).map((row) => [row.itemId, row]));
  const result: CategoryBreakdown[] = [];
  for (const level of ["level1", "level2", "level3", "level4"] as const) {
    const groups = new Map<string, { categoryName: string; rows: NumericComparison[] }>();
    for (const annotation of finalization.annotations) {
      const row = numericByItem.get(annotation.itemId); if (!row) continue;
      const category = categoryFor(annotation, level);
      const key = `${level}:${category.id}`;
      const group = groups.get(key) ?? { categoryName: category.name, rows: [] };
      group.rows.push(row); groups.set(key, group);
    }
    for (const [key, group] of [...groups.entries()].sort((left, right) => left[1].categoryName.localeCompare(right[1].categoryName) || left[0].localeCompare(right[0]))) {
      const n = group.rows.length;
      result.push({
        level, categoryId: key.slice(level.length + 1), categoryName: group.categoryName,
        itemIds: group.rows.map((row) => row.itemId),
        metrics: calculateReliabilityMetrics(group.rows, 10),
        ...(n < 10 ? { reliabilityNote: "Insufficient sample for a stable reliability estimate. Kappa is suppressed under the SafeFlow n < 10 reporting rule." } : {}),
      });
    }
  }
  return result;
}
