import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { airBenchTaxonomy } from "../benchmarks/airBenchTaxonomy";
import { buildTaxonomyReferenceView } from "../benchmarks/taxonomyReference";
import { airBenchStarterCurriculum } from "./curriculum";
import { TrainingItemView } from "./TrainingItemView";
import type { TrainingAttempt } from "./types";

const item = airBenchStarterCurriculum.items[3];
const pack = loadBundledBenchmarkPack("air-bench-2024");
const leaf = airBenchTaxonomy.leaves.find((candidate) => candidate.categoryId === item.categoryId)!;
const reference = buildTaxonomyReferenceView(leaf, airBenchTaxonomy.conceptualLevel3Nodes);
const baseProps = {
  item, pack, taxonomyReference: reference, position: 4, total: 10,
  onLabelChange: vi.fn(), onConfidenceChange: vi.fn(), onCheck: vi.fn(), onNext: vi.fn(), onReferenceOpen: vi.fn(), onAddReview: vi.fn(),
};

describe("training item feedback boundary", () => {
  it("does not reveal gold explanation or decisive evidence before checking", () => {
    const { container } = render(<TrainingItemView {...baseProps} />);
    const view = within(container);
    expect(view.queryByText(item.correctExplanation)).not.toBeInTheDocument();
    expect(view.queryByText("Correct answer:")).not.toBeInTheDocument();
    expect(view.queryByLabelText("Decisive evidence")).not.toBeInTheDocument();
    expect(view.getByRole("button", { name: "Check Answer" })).toBeDisabled();
    expect(view.getByText("0 — Provides risky assistance")).toBeInTheDocument();
    expect(view.queryByText(/Unsafe \/ enabling/)).not.toBeInTheDocument();
  });

  it("shows the gold label, evidence, all three explanations, rule, and provenance after submission", () => {
    const attempt: TrainingAttempt = {
      id: "a", sessionId: "s", itemId: item.id, benchmarkId: "air-bench-2024", selectedLabel: "1", confidence: "High",
      correct: false, referenceOpened: true, attemptNumber: 1, trainingItemVersion: item.trainingItemVersion,
      explanationVersion: item.explanationVersion, rubricVersion: item.rubricVersion, benchmarkPackVersion: item.benchmarkPackVersion, completedAt: "now",
    };
    const { container } = render(<TrainingItemView {...baseProps} attempt={attempt} />);
    const view = within(container);
    expect(view.getByText("Not quite — here’s the distinction")).toBeInTheDocument();
    expect(view.getByText(item.correctExplanation)).toBeInTheDocument();
    expect(view.getByLabelText("Decisive evidence")).toHaveTextContent(item.decisiveEvidence[0].text);
    expect(view.getByText("Why 0 is correct")).toBeInTheDocument();
    expect(view.getByText("Why 0.5 is incorrect")).toBeInTheDocument();
    expect(view.getByText("Why 1 is incorrect")).toBeInTheDocument();
    expect(view.getByText("Applicable rule")).toBeInTheDocument();
    expect(view.getByText("Training content provenance")).toBeInTheDocument();
  });

  it("reports reference lookup only when the drawer is opened", () => {
    const onOpen = vi.fn();
    const { container } = render(<TrainingItemView {...baseProps} onReferenceOpen={onOpen} />);
    const details = container.querySelector(".reference-drawer") as HTMLDetailsElement;
    details.open = true; fireEvent(details, new Event("toggle"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
