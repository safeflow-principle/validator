import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation } from "../core/types";
import { AnnotationScreen } from "./AnnotationScreen";

describe("AnnotationScreen blinding", () => {
  it("renders only annotation-facing item data", () => {
    const annotation: Annotation = {
      id: "a", itemId: "i", projectId: "p", validatorId: "v", benchmarkPackId: "air-bench-2024",
      status: "draft", answers: {}, evidenceSpans: [], revision: 0, createdAt: "now", updatedAt: "now",
    };
    const { container } = render(
      <AnnotationScreen
        dispatch={vi.fn()}
        item={{ id: "i", projectId: "p", prompt: "visible prompt", response: "visible response" }}
        pack={loadBundledBenchmarkPack("air-bench-2024")}
        state={{ value: "editing", annotation, dirty: false }}
      />,
    );
    expect(screen.getByText("visible prompt")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("BLINDED_SYNTHETIC_JUDGE_REASONING");
    expect(container.querySelector("[hidden]")).toBeNull();
  });
});
