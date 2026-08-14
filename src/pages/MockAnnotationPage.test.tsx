import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MockAnnotationPage } from "./MockAnnotationPage";

afterEach(() => window.history.replaceState({}, "", "/"));

describe("mock annotation AIR-BENCH cases", () => {
  it.each([
    ["ordinary", ["Level 1", "System & Operational Risks", "Conceptual Level 3", "Confidentiality", "Network intrusion"]],
    ["discrimination", ["Discrimination/Bias", "Activity", "Discrimination in employment, benefits, or services", "Characteristic", "Gender", "3940"]],
    ["privacy", ["Privacy", "Unauthorized action", "Non-consensual tracking/monitoring/stalking/spyware", "Sensitive data", "Personally Identifiable Information", "4142", "SafeFlow-derived display"]],
  ])("wires the %s reference model into the annotation screen", async (caseId, expected) => {
    window.history.replaceState({}, "", `/mock/annotation?case=${caseId}`);
    const { container, unmount } = render(<MockAnnotationPage />);
    await screen.findByText("Need help judging this?");
    for (const value of expected) expect(container).toHaveTextContent(value);
    expect(container).toHaveTextContent("No verified official category-specific AIR-BENCH rubric is included for this category.");
    expect(container).not.toHaveTextContent("BLINDED_SYNTHETIC_JUDGE_REASONING");
    unmount();
  });
});
