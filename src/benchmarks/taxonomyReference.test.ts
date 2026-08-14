import { describe, expect, it } from "vitest";
import type { NormalizedTaxonomyLeaf, NormalizedTaxonomyLevel } from "../core/types";
import { buildTaxonomyReferenceView } from "./taxonomyReference";

const nodes: NormalizedTaxonomyLevel[] = [
  { id: "39", name: "Discriminatory Activities", authority: "official-air-2024-paper" },
  { id: "40", name: "Protected Characteristics", authority: "official-air-2024-paper" },
  { id: "41", name: "Unauthorized Privacy Violations", authority: "official-air-2024-paper" },
  { id: "42", name: "Types of Sensitive Data", authority: "official-air-2024-paper" },
];

function compositeLeaf(kind: "discrimination" | "privacy"): NormalizedTaxonomyLeaf {
  const discrimination = kind === "discrimination";
  return {
    categoryId: discrimination ? "14.3940.4" : "15.4142.61",
    promptCount: 1,
    level1: { id: "4", name: "Legal & Rights Risks", authority: "official-air-2024-paper" },
    level2: { id: discrimination ? "14" : "15", name: discrimination ? "Discrimination/Bias" : "Privacy", authority: "official-air-bench-dataset" },
    sourceLevel3: {
      id: discrimination ? "3940" : "4142",
      name: discrimination ? "Discrimination/Protected Characteristics Combinations" : "Privacy Violations/Sensitive Data Combinations",
      authority: "official-air-bench-dataset",
    },
    conceptualLevel3: {
      kind: "composite",
      dimensions: discrimination
        ? [
            { nodeId: "39", role: "activity", displayLabel: "Activity", value: { id: "39.1", sourceName: "Discrimination in employment, benefits, or services", displayName: "Discrimination in employment, benefits, or services", sourceAuthority: "official-air-bench-dataset", displayAuthority: "official-air-bench-dataset" } },
            { nodeId: "40", role: "protected-characteristic", displayLabel: "Characteristic", value: { id: "40.4", sourceName: "Gender", displayName: "Gender", sourceAuthority: "official-air-bench-dataset", displayAuthority: "official-air-bench-dataset" } },
          ]
        : [
            { nodeId: "41", role: "unauthorized-action", displayLabel: "Unauthorized action", value: { id: "41.7", sourceName: "Non-consensual tracking/monitoring/stalking/spyware", displayName: "Non-consensual tracking/monitoring/stalking/spyware", sourceAuthority: "official-air-bench-dataset", displayAuthority: "official-air-bench-dataset" } },
            { nodeId: "42", role: "sensitive-data-type", displayLabel: "Sensitive data", value: { id: "42.1", sourceName: "PII (Personal Identifiable Information)", displayName: "Personally Identifiable Information", sourceAuthority: "official-air-bench-dataset", displayAuthority: "safeflow-derived" } },
          ],
    },
    level4: { id: "leaf", name: "source composite name", authority: "official-air-bench-dataset" },
  };
}

describe("taxonomy reference view", () => {
  it("renders discrimination as activity by characteristic while preserving 3940", () => {
    expect(buildTaxonomyReferenceView(compositeLeaf("discrimination"), nodes)).toMatchObject({
      heading: "Discrimination/Bias",
      sourceEncoding: { id: "3940", name: "Discrimination/Protected Characteristics Combinations" },
      conceptualLevel3Nodes: ["Discriminatory Activities", "Protected Characteristics"],
      details: [
        { label: "Activity", value: "Discrimination in employment, benefits, or services", provenance: "official-air-bench-dataset" },
        { label: "Characteristic", value: "Gender", provenance: "official-air-bench-dataset" },
      ],
    });
  });

  it("renders privacy as unauthorized action by sensitive-data type while preserving 4142", () => {
    const view = buildTaxonomyReferenceView(compositeLeaf("privacy"), nodes);
    expect(view.sourceEncoding.id).toBe("4142");
    expect(view.details).toEqual([
      { label: "Unauthorized action", value: "Non-consensual tracking/monitoring/stalking/spyware", provenance: "official-air-bench-dataset" },
      { label: "Sensitive data", value: "Personally Identifiable Information", provenance: "safeflow-derived", sourceValue: "PII (Personal Identifiable Information)" },
    ]);
  });
});
