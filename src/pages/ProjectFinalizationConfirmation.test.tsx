import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { finalizationSource } from "../finalization/testFixtures";
import { openSafeFlowDatabase } from "../storage/database";
import { ProjectReviewPage } from "./ProjectReviewPage";

describe("human finalization confirmation", () => {
  it("requires explicit record and warning acknowledgement", async () => {
    const database = await openSafeFlowDatabase(); await database.clearAll();
    const source = finalizationSource();
    await database.putBenchmarkPack(source.benchmarkPack); await database.putProject(source.project);
    for (const item of source.items) await database.putValidationItem(item);
    for (const annotation of source.annotations) await database.putAnnotation(annotation);
    for (const run of source.importRuns) await database.putImportRun(run);
    database.close();

    const { unmount } = render(<ProjectReviewPage projectId={source.project.id} />);
    const openButton = await screen.findByRole("button", { name: "Finalize Human Validation" });
    fireEvent.click(openButton);
    const dialog = screen.getByRole("dialog", { name: "Finalize Human Validation?" });
    const finalButton = dialog.querySelector("button.primary-button") as HTMLButtonElement;
    expect(finalButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/creates the human-validation record used for analysis/i));
    expect(finalButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/flagged and low-confidence states/i));
    expect(finalButton).toBeEnabled();
    unmount();
  });
});
