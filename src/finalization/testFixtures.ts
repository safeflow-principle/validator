import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import type { Annotation, ImportRun, JudgeArtifact, Project, ValidationItem } from "../core/types";
import type { HumanFinalizationSourceRecords } from "./types";

export function finalizationSource(count = 3): HumanFinalizationSourceRecords {
  const benchmarkPack = loadBundledBenchmarkPack("air-bench-2024");
  const project: Project = {
    id: "final-project", name: "Finalization fixture", benchmarkPackId: benchmarkPack.id, benchmarkPackVersion: benchmarkPack.version, workspaceMode: "LOCAL",
    status: "HUMAN_COMPLETE", createdAt: "2026-08-14T20:00:00.000Z", updatedAt: "2026-08-14T21:00:00.000Z",
  };
  const items: ValidationItem[] = Array.from({ length: count }, (_, index) => ({
    id: `final-item-${index + 1}`, projectId: project.id, externalId: `source-${index + 1}`,
    prompt: `Prompt ${index + 1}`, response: index === 0 ? "Unicode 🙂 response\nSecond line" : `Response ${index + 1}`,
    categoryId: index === 1 ? "14.3940.4" : "1.1.1",
    metadata: { importSourceRow: index + 1, benchmarkPromptId: `air-${index + 1}`, fieldProvenance: { prompt: "uploaded-source" } },
    createdAt: project.createdAt,
  }));
  const annotations: Annotation[] = items.map((item, index) => ({
    id: `${item.id}:local-validator`, itemId: item.id, projectId: project.id, validatorId: "local-validator",
    benchmarkPackId: benchmarkPack.id, benchmarkPackVersion: benchmarkPack.version, rubricVersion: benchmarkPack.version,
    status: "submitted", answers: { score: [0, 0.5, 1][index % 3], confidence: index === 2 ? "Low" : "High", reasoning: `Human reason ${index + 1}`, "needs-review": index === 1 },
    evidenceSpans: index === 0 ? [{ start: 0, end: 10, text: "Unicode 🙂" }] : [], revision: index + 1,
    createdAt: "2026-08-14T20:05:00.000Z", updatedAt: `2026-08-14T20:10:${String(index).padStart(2, "0")}.000Z`, submittedAt: `2026-08-14T20:10:${String(index).padStart(2, "0")}.000Z`,
  }));
  const importRuns: ImportRun[] = [{
    id: "final-import", projectId: project.id, sourceName: "finalization.csv", sourceSha256: "a".repeat(64), status: "complete",
    itemCount: count, errors: [], format: "csv", createdAt: project.createdAt,
  }];
  return { project, items, annotations, importRuns, benchmarkPack };
}

/** Synthetic-only artifacts for local E2E tests and the 20-row fixture workflow. */
export function mockJudgeArtifacts(source: HumanFinalizationSourceRecords, judgeId = "mock-automated-judge"): JudgeArtifact[] {
  return source.items.map((item, index) => ({
    id: `mock-judge-${index + 1}`,
    itemId: item.id,
    judgeId,
    score: index % 4 === 0 ? 1 : [0, 0.5, 1][index % 3],
    reasoning: `Synthetic judge reasoning for source row ${index + 1}.`,
    metadata: { synthetic: true, fixture: "airbench-like-validation-20.csv", sourceRow: index + 1 },
    createdAt: "2026-08-14T20:04:00.000Z",
  }));
}
