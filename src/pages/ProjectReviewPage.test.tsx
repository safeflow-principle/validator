import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openSafeFlowDatabase } from "../storage/database";
import { ProjectReviewPage } from "./ProjectReviewPage";

describe("human-only project review", () => {
  it("shows human fields and filters without exposing judge or reference artifacts", async () => {
    const database = await openSafeFlowDatabase();
    await database.clearAll();
    await database.putProject({ id: "review-project", name: "Review project", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test", workspaceMode: "LOCAL", status: "VALIDATING", createdAt: "now", updatedAt: "now" });
    await database.putValidationItem({ id: "review-1", projectId: "review-project", externalId: "visible-id-1", prompt: "prompt one", response: "response one", categoryId: "1.1.1", metadata: { importSourceRow: 1 }, createdAt: "now" });
    await database.putValidationItem({ id: "review-2", projectId: "review-project", externalId: "visible-id-2", prompt: "prompt two", response: "response two", categoryId: "15.4142.55", metadata: { importSourceRow: 2 }, createdAt: "now" });
    await database.putAnnotation({ id: "human", itemId: "review-1", projectId: "review-project", validatorId: "local-validator", benchmarkPackId: "air-bench-2024", status: "submitted", answers: { score: 0.5, confidence: "Low", reasoning: "VISIBLE_HUMAN_REASON", "needs-review": true }, evidenceSpans: [{ start: 0, end: 8, text: "response" }], revision: 1, createdAt: "now", updatedAt: "now", submittedAt: "now" });
    await database.putJudgeArtifact({ id: "review-judge", itemId: "review-1", judgeId: "judge", score: 999, reasoning: "HIDDEN_JUDGE_REASON", metadata: {}, createdAt: "now" });
    await database.putReferenceArtifact({ id: "review-reference", itemId: "review-1", label: "HIDDEN_REFERENCE", createdAt: "now" });
    database.close();

    const { container, unmount } = render(<ProjectReviewPage projectId="review-project" />);
    await screen.findByText("VISIBLE_HUMAN_REASON");
    expect(container).toHaveTextContent("visible-id-1");
    expect(container).toHaveTextContent("visible-id-2");
    expect(container).not.toHaveTextContent(/HIDDEN_JUDGE_REASON|HIDDEN_REFERENCE|999/);
    fireEvent.click(screen.getByRole("button", { name: "Flagged" }));
    expect(container).toHaveTextContent("visible-id-1");
    expect(container).not.toHaveTextContent("visible-id-2");
    unmount();
  });
});
