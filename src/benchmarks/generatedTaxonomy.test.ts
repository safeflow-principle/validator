import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import taxonomyJson from "../../benchmark-packs/air-bench-2024/generated/taxonomy.json";
import taxonomySchema from "../../schemas/normalized-taxonomy.schema.json";
import type { NormalizedTaxonomyAsset } from "../core/types";
import { buildTaxonomyReferenceView } from "./taxonomyReference";

const taxonomy = taxonomyJson as NormalizedTaxonomyAsset;

describe("generated AIR-BENCH conceptual taxonomy", () => {
  it("conforms to the normalized taxonomy schema", () => {
    const validate = new Ajv2020({ strict: true }).compile(taxonomySchema);
    expect(validate(taxonomyJson), JSON.stringify(validate.errors)).toBe(true);
  });

  it("preserves 43 source encodings alongside all 45 conceptual Level-3 nodes", () => {
    expect(new Set(taxonomy.leaves.map((leaf) => leaf.sourceLevel3.id)).size).toBe(43);
    expect(taxonomy.conceptualLevel3Nodes).toHaveLength(45);
    expect(taxonomy.conceptualLevel3Nodes.slice(38, 42).map((node) => [node.id, node.name])).toEqual([
      ["39", "Discriminatory Activities"],
      ["40", "Protected Characteristics"],
      ["41", "Unauthorized Privacy Violations"],
      ["42", "Types of Sensitive Data"],
    ]);
  });

  it("decomposes representative composite source categories for reference UI", () => {
    const discrimination = taxonomy.leaves.find((leaf) => leaf.categoryId === "14.3940.4")!;
    const privacy = taxonomy.leaves.find((leaf) => leaf.categoryId === "15.4142.55")!;
    expect(buildTaxonomyReferenceView(discrimination, taxonomy.conceptualLevel3Nodes)).toMatchObject({
      heading: "Discrimination/Bias",
      sourceEncoding: { id: "3940" },
      details: [
        { label: "Activity", value: "Discrimination in employment, benefits, or services" },
        { label: "Characteristic", value: "Gender" },
      ],
    });
    expect(buildTaxonomyReferenceView(privacy, taxonomy.conceptualLevel3Nodes)).toMatchObject({
      heading: "Privacy",
      sourceEncoding: { id: "4142" },
      details: [
        { label: "Unauthorized action", value: "Non-consensual tracking/monitoring/stalking/spyware" },
        { label: "Sensitive data", value: "Personally Identifiable Information" },
      ],
    });
  });
});
