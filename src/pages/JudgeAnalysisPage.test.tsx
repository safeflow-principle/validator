import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createJudgeAnalysis } from "../analysis/createJudgeAnalysis";
import { finalizeHumanValidation } from "../finalization/finalizeHumanValidation";
import { finalizationSource, mockJudgeArtifacts } from "../finalization/testFixtures";
import { openSafeFlowDatabase } from "../storage/database";
import { JudgeAnalysisPage } from "./JudgeAnalysisPage";

describe("unblinded judge analysis route", () => {
  it("shows the exact frozen human snapshot and snapshotted synthetic judge artifacts", async () => {
    const database = await openSafeFlowDatabase(); await database.clearAll();
    const source = finalizationSource();
    await database.putBenchmarkPack(source.benchmarkPack); await database.putProject(source.project);
    for (const item of source.items) await database.putValidationItem(item);
    for (const annotation of source.annotations) await database.putAnnotation(annotation);
    for (const run of source.importRuns) await database.putImportRun(run);
    for (const artifact of mockJudgeArtifacts(source)) await database.putJudgeArtifact(artifact);
    const ids = ["page-hf", "page-hf-audit", "page-ja", "page-ja-audit"];
    const finalization = await finalizeHumanValidation(database, source.project.id, { acknowledgeWarnings: true, createId: () => ids.shift()! });
    const analysis = await createJudgeAnalysis(database, finalization.id, { confirmed: true, createId: () => ids.shift()! });
    database.close();

    const view = render(<JudgeAnalysisPage projectId={source.project.id} analysisId={analysis.id} />);
    await screen.findByText("Judge Validation");
    expect(view.container).toHaveTextContent("UNBLINDED");
    expect(view.container).toHaveTextContent("Synthetic judge reasoning for source row 1.");
    expect(view.container).toHaveTextContent(finalization.id);
    expect(view.container).toHaveTextContent(analysis.judgeArtifactSetHash);
    expect(view.container).toHaveTextContent("Human labels are rows; automated-judge labels are columns.");
    fireEvent.click(screen.getByRole("button", { name: "Human 0, Judge 1: 1 cases" }));
    expect(view.container).toHaveTextContent("Human 0 / Judge 1 · 1 case(s)");
    expect(view.container).toHaveTextContent("source-1");
    expect(view.container).not.toHaveTextContent("source-2");
    expect(view.container).not.toHaveTextContent("HIDDEN_FINALIZED_REFERENCE");
    view.unmount();
  });
});
