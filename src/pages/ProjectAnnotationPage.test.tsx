import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { openSafeFlowDatabase } from "../storage/database";
import { ProjectAnnotationPage } from "./ProjectAnnotationPage";

describe("real project annotation route blinding", () => {
  it("renders a repository-blinded item without judge, reference, or other-validator data", async () => {
    const database = await openSafeFlowDatabase();
    await database.clearAll();
    await database.putProject({ id: "real-project", name: "Real imported project", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "test", status: "READY", createdAt: "now", updatedAt: "now" });
    await database.putValidationItem({ id: "real-item", projectId: "real-project", externalId: "synthetic-real-1", prompt: "VISIBLE_REAL_PROMPT", response: "VISIBLE_REAL_RESPONSE", categoryId: "14.3940.4", metadata: { secretMetadata: "ITEM_METADATA_SECRET", importSourceRow: 1 }, createdAt: "now" });
    await database.putJudgeArtifact({ id: "judge", itemId: "real-item", judgeId: "judge", score: 999, reasoning: "JUDGE_REASONING_SECRET", metadata: {}, createdAt: "now" });
    await database.putReferenceArtifact({ id: "reference", itemId: "real-item", label: "REFERENCE_LABEL_SECRET", createdAt: "now" });
    await database.putAnnotation({
      id: "other", itemId: "real-item", projectId: "real-project", validatorId: "other-validator", benchmarkPackId: "air-bench-2024",
      status: "submitted", answers: { score: 0, confidence: "Low", reasoning: "OTHER_ANNOTATION_SECRET" }, evidenceSpans: [], revision: 1, createdAt: "now", updatedAt: "now",
    });
    database.close();

    const { container, unmount } = render(<ProjectAnnotationPage projectId="real-project" />);
    await screen.findByText("VISIBLE_REAL_PROMPT");
    expect(container).toHaveTextContent("VISIBLE_REAL_RESPONSE");
    expect(container).toHaveTextContent("Activity");
    expect(container).not.toHaveTextContent(/JUDGE_REASONING_SECRET|REFERENCE_LABEL_SECRET|OTHER_ANNOTATION_SECRET|ITEM_METADATA_SECRET|999/);
    expect(container.querySelector("[hidden]")).toBeNull();
    unmount();
  });
});
