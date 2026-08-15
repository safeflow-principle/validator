import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import { finalizationSource } from "../finalization/testFixtures";
import { openSafeFlowDatabase } from "../storage/database";
import { FinalizedHumanResultsPage } from "./FinalizedHumanResultsPage";
import { ProjectAnnotationPage } from "./ProjectAnnotationPage";

describe("finalized human-only routes", () => {
  it("shows immutable human results and locks annotation controls without exposing isolated artifacts", async () => {
    const database = await openSafeFlowDatabase(); await database.clearAll();
    const source = finalizationSource();
    await database.putBenchmarkPack(source.benchmarkPack); await database.putProject(source.project);
    for (const item of source.items) await database.putValidationItem(item);
    for (const annotation of source.annotations) await database.putAnnotation(annotation);
    for (const run of source.importRuns) await database.putImportRun(run);
    await database.putJudgeArtifact({ id: "hidden-judge", itemId: source.items[0].id, judgeId: "judge", score: 999, reasoning: "HIDDEN_FINALIZED_JUDGE_REASON", metadata: {}, createdAt: "now" });
    await database.putReferenceArtifact({ id: "hidden-reference", itemId: source.items[0].id, label: "HIDDEN_FINALIZED_REFERENCE", createdAt: "now" });
    const ids = ["dom-finalization", "dom-audit"];
    await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: () => ids.shift()! });
    database.close();

    const results = render(<FinalizedHumanResultsPage projectId={source.project.id} />);
    await screen.findByText("Finalized Human Results · read only");
    expect(results.container).toHaveTextContent("Human reason 1");
    expect(results.container).not.toHaveTextContent(/HIDDEN_FINALIZED_JUDGE_REASON|HIDDEN_FINALIZED_REFERENCE/);
    expect(screen.queryByText("999", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare With Automated Judge" }));
    const dialog = screen.getByRole("dialog", { name: "Compare with the automated judge?" });
    expect(dialog).not.toHaveTextContent(/HIDDEN_FINALIZED_JUDGE_REASON|HIDDEN_FINALIZED_REFERENCE/);
    expect(screen.queryByText("999", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unblind and Compare" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/this specific finalized human snapshot/i));
    expect(screen.getByRole("button", { name: "Unblind and Compare" })).toBeEnabled();
    results.unmount();

    const locked = render(<ProjectAnnotationPage projectId={source.project.id} />);
    await screen.findByText(/Production annotation controls are unavailable\./);
    expect(locked.container).not.toHaveTextContent(/HIDDEN_FINALIZED_JUDGE_REASON|HIDDEN_FINALIZED_REFERENCE/);
    expect(screen.queryByText("999", { exact: true })).not.toBeInTheDocument();
    expect(locked.container).not.toHaveTextContent("Submit & Next");
    expect(locked.container.querySelector("textarea")).toBeNull();
    locked.unmount();
  });
});
