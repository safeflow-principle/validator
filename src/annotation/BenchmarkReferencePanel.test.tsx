import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import taxonomyJson from "../../benchmark-packs/air-bench-2024/generated/taxonomy.json";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { buildTaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import type { NormalizedTaxonomyAsset } from "../core/types";
import { BenchmarkReferencePanel } from "./BenchmarkReferencePanel";

const pack = loadBundledBenchmarkPack("air-bench-2024");
const taxonomy = taxonomyJson as NormalizedTaxonomyAsset;

function renderCategory(categoryId: string) {
  const leaf = taxonomy.leaves.find((candidate) => candidate.categoryId === categoryId)!;
  const category = pack.categories.find((candidate) => candidate.id === categoryId)!;
  return render(
    <BenchmarkReferencePanel
      category={category}
      pack={pack}
      reference={buildTaxonomyReferenceView(leaf, taxonomy.conceptualLevel3Nodes)}
    />,
  );
}

describe("AIR-BENCH reference panel", () => {
  it("renders an ordinary four-level hierarchy with generic rules and provenance", () => {
    const { container } = renderCategory("1.1.1");
    const reference = within(container);
    expect(reference.getByText("System & Operational Risks")).toBeInTheDocument();
    expect(reference.getAllByText("Security Risks")).toHaveLength(2);
    expect(reference.getAllByText("Confidentiality").length).toBeGreaterThan(0);
    expect(reference.getByText("Network intrusion")).toBeInTheDocument();
    expect(reference.getAllByText("Official AIR-BENCH dataset").length).toBeGreaterThan(0);
    expect(reference.getAllByText("Official AIR 2024 taxonomy").length).toBeGreaterThan(0);
    expect(reference.getAllByText("SafeFlow paraphrase")).toHaveLength(3);
    expect(reference.getByText("No verified official category-specific AIR-BENCH rubric is included for this category.")).toBeInTheDocument();
  });

  it("renders 3940 as a discrimination activity by characteristic", () => {
    const { container } = renderCategory("14.3940.4");
    const reference = within(container).getByRole("heading", { name: "Discrimination/Bias" }).closest<HTMLElement>(".reference-content")!;
    expect(within(reference).getByText("Discrimination in employment, benefits, or services")).toBeInTheDocument();
    expect(within(reference).getByText("Gender")).toBeInTheDocument();
    expect(within(reference).getByText("3940")).toBeInTheDocument();
    expect(within(reference).getByText("Discrimination/Protected Characteristics Combinations")).toBeInTheDocument();
  });

  it("renders 4142 with distinct source and SafeFlow-derived privacy terminology", () => {
    renderCategory("15.4142.55");
    expect(screen.getByText("Non-consensual tracking/monitoring/stalking/spyware")).toBeInTheDocument();
    expect(screen.getByText("Personally Identifiable Information")).toBeInTheDocument();
    expect(screen.getByText("Source terminology: PII (Personal Identifiable Information)")).toBeInTheDocument();
    expect(screen.getByText("SafeFlow-derived display")).toBeInTheDocument();
    expect(screen.getByText("4142")).toBeInTheDocument();
  });
});
