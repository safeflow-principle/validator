import type { NormalizedTaxonomyLeaf, NormalizedTaxonomyLevel } from "../core/types";

export interface TaxonomyReferenceField {
  label: string;
  value: string;
  provenance: NormalizedTaxonomyLevel["authority"] | "safeflow-derived";
  sourceValue?: string;
}

export interface TaxonomyReferenceView {
  heading: string;
  sourceEncoding: { id: string; name: string };
  conceptualLevel3Nodes: string[];
  hierarchy: TaxonomyReferenceField[];
  details: TaxonomyReferenceField[];
}

export function buildTaxonomyReferenceView(
  leaf: NormalizedTaxonomyLeaf,
  conceptualNodes: readonly NormalizedTaxonomyLevel[],
): TaxonomyReferenceView {
  const nodesById = new Map(conceptualNodes.map((node) => [node.id, node]));
  if (leaf.conceptualLevel3.kind === "single") {
    const node = nodesById.get(leaf.conceptualLevel3.nodeId);
    if (!node) throw new Error(`Unknown conceptual Level-3 node: ${leaf.conceptualLevel3.nodeId}`);
    return {
      heading: leaf.level2.name,
      sourceEncoding: { id: leaf.sourceLevel3.id, name: leaf.sourceLevel3.name },
      conceptualLevel3Nodes: [node.name],
      hierarchy: [
        { label: "Level 1", value: leaf.level1.name, provenance: leaf.level1.authority },
        { label: "Level 2", value: leaf.level2.name, provenance: leaf.level2.authority },
        { label: "Conceptual Level 3", value: node.name, provenance: node.authority },
        { label: "Level 4", value: leaf.level4.name, provenance: leaf.level4.authority },
      ],
      details: [],
    };
  }

  const conceptualLevel3Nodes = leaf.conceptualLevel3.dimensions.map((dimension) => {
    const node = nodesById.get(dimension.nodeId);
    if (!node) throw new Error(`Unknown conceptual Level-3 node: ${dimension.nodeId}`);
    return node;
  });
  return {
    heading: leaf.level2.name,
    sourceEncoding: { id: leaf.sourceLevel3.id, name: leaf.sourceLevel3.name },
    conceptualLevel3Nodes: conceptualLevel3Nodes.map((node) => node.name),
    hierarchy: [
      { label: "Level 1", value: leaf.level1.name, provenance: leaf.level1.authority },
      { label: "Level 2", value: leaf.level2.name, provenance: leaf.level2.authority },
      {
        label: "Conceptual Level 3",
        value: conceptualLevel3Nodes.map((node) => node.name).join(" × "),
        provenance: "official-air-2024-paper",
      },
      { label: "Level 4 source record", value: leaf.level4.name, provenance: leaf.level4.authority },
    ],
    details: leaf.conceptualLevel3.dimensions.map((dimension) => ({
      label: dimension.displayLabel,
      value: dimension.value.displayName,
      provenance: dimension.value.displayAuthority,
      ...(dimension.value.displayName === dimension.value.sourceName ? {} : { sourceValue: dimension.value.sourceName }),
    })),
  };
}
