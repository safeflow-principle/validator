import { render, screen, within } from "@testing-library/react";
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

  it("keeps the reasoning field enabled and focused during autosave", () => {
    const annotation: Annotation = {
      id: "a", itemId: "i", projectId: "p", validatorId: "v", benchmarkPackId: "air-bench-2024",
      status: "draft", answers: { reasoning: "Still typing" }, evidenceSpans: [], revision: 0, createdAt: "now", updatedAt: "now",
    };
    const dispatch = vi.fn();
    const item = { id: "i", projectId: "p", prompt: "prompt", response: "response" };
    const pack = loadBundledBenchmarkPack("air-bench-2024");
    const { container, rerender } = render(
      <AnnotationScreen
        dispatch={dispatch}
        item={item}
        pack={pack}
        state={{ value: "editing", annotation, dirty: true }}
      />,
    );
    const reasoning = within(container).getByRole("textbox", { name: /Reasoning/ });
    reasoning.focus();
    rerender(<AnnotationScreen dispatch={dispatch} item={item} pack={pack} state={{ value: "saving", annotation, savingAnnotation: annotation, intent: "autosave", dirty: false }} />);
    expect(reasoning).toBeEnabled();
    expect(reasoning).toHaveFocus();
  });
});
