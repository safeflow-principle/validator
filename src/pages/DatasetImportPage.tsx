import { useMemo, useState } from "react";
import { loadBundledBenchmarkPack } from "../benchmarks/loader";
import { airBenchPromptIndex } from "../benchmarks/airBenchAssets";
import { buildLocalImportBundle } from "../import/buildBundle";
import { sha256Hex } from "../import/hash";
import { parseDatasetText } from "../import/parser";
import { preflightDataset, suggestMapping } from "../import/preflight";
import type { DatasetMapping, ImportField, ParsedDataset } from "../import/types";
import { openSafeFlowDatabase } from "../storage/database";

const pack = loadBundledBenchmarkPack("air-bench-2024");
const knownCategories = new Set(pack.categories.map((category) => category.id));
const mappingFields: Array<{ id: ImportField; label: string; required?: boolean; sensitive?: boolean }> = [
  { id: "prompt", label: "Prompt (or use a recognized AIR-BENCH prompt ID)" },
  { id: "response", label: "Assistant response", required: true },
  { id: "externalId", label: "External item ID" },
  { id: "benchmarkPromptId", label: "AIR-BENCH prompt ID (or map Prompt)" },
  { id: "categoryId", label: "AIR-BENCH category ID" },
  { id: "judgeScore", label: "Automated-judge score", sensitive: true },
  { id: "judgeReasoning", label: "Automated-judge reasoning", sensitive: true },
  { id: "referenceLabel", label: "Reference label", sensitive: true },
];

export function DatasetImportPage() {
  const [dataset, setDataset] = useState<ParsedDataset>();
  const [sourceName, setSourceName] = useState("");
  const [projectName, setProjectName] = useState("Imported validation project");
  const [sourceSha256, setSourceSha256] = useState("");
  const [mapping, setMapping] = useState<DatasetMapping>({});
  const [fileError, setFileError] = useState<string>();
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "complete" | "error"; message?: string }>({ kind: "idle" });
  const preflight = useMemo(
    () => dataset ? preflightDataset(dataset, mapping, { knownCategoryIds: knownCategories, promptIndex: airBenchPromptIndex }) : undefined,
    [dataset, mapping],
  );

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setFileError(undefined);
    setStatus({ kind: "idle" });
    try {
      const contents = await file.text();
      const [parsed, sourceHash] = await Promise.all([
        Promise.resolve(parseDatasetText(file.name, contents)),
        sha256Hex(contents),
      ]);
      setSourceName(file.name);
      setSourceSha256(sourceHash);
      setDataset(parsed);
      setMapping(suggestMapping(parsed.columns));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read the local file.");
    }
  }

  async function importLocally() {
    if (!dataset || !preflight?.ready || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      const bundle = buildLocalImportBundle(preflight, {
        projectName,
        benchmarkPackId: pack.id,
        benchmarkPackVersion: pack.version,
        sourceName,
        sourceSha256,
        format: dataset.format,
        mapping,
      });
      const database = await openSafeFlowDatabase();
      try {
        await database.putBenchmarkPack(pack);
        await database.importProjectBundle(bundle);
      } finally {
        database.close();
      }
      window.location.assign(`/projects/${bundle.project.id}`);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Local import failed." });
    }
  }

  return (
    <main className="import-shell">
      <a className="wordmark" href="/">SafeFlow</a>
      <span className="eyebrow">Milestone 2 · local dataset import</span>
      <h1>Map and preflight a dataset</h1>
      <p className="import-intro">The file is read in this browser. Nothing is uploaded or transmitted.</p>

      <section className="import-card">
        <h2>1. Choose a local file</h2>
        <input accept=".csv,.json,.jsonl,.ndjson" aria-label="Dataset file" onChange={(event) => void chooseFile(event.target.files?.[0])} type="file" />
        <p className="field-help">Supported: CSV, JSON arrays or objects with a rows/items array, and JSONL.</p>
        {fileError && <p className="error-message" role="alert">{fileError}</p>}
        {dataset && <p className="import-fact">Detected {dataset.format.toUpperCase()} · {dataset.rows.length} rows · {dataset.columns.length} columns</p>}
      </section>

      {dataset && (
        <>
          <section className="import-card">
            <h2>2. Map fields</h2>
            <p className="field-help">Judge and reference fields are stored in isolated records and never embedded in annotation items.</p>
            <div className="mapping-grid">
              {mappingFields.map((field) => (
                <label key={field.id}>
                  <span>{field.label}{field.required ? " *" : ""}{field.sensitive && <small> Blinded field</small>}</span>
                  <select
                    aria-label={field.label}
                    onChange={(event) => setMapping((current) => ({ ...current, [field.id]: event.target.value || undefined }))}
                    value={mapping[field.id] ?? ""}
                  >
                    <option value="">Not mapped</option>
                    {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="import-card">
            <h2>3. Preflight</h2>
            {preflight && (
              <>
                <div className="preflight-summary">
                  <span><strong>{preflight.summary.sourceRows}</strong> source rows</span>
                  <span><strong>{preflight.summary.categorizedRows}</strong> categorized</span>
                  <span><strong>{preflight.summary.judgeArtifacts}</strong> judge artifacts</span>
                  <span><strong>{preflight.summary.referenceArtifacts}</strong> reference artifacts</span>
                  <span className={preflight.summary.errors ? "summary-error" : ""}><strong>{preflight.summary.errors}</strong> errors</span>
                </div>
                {preflight.issues.length ? (
                  <ul className="preflight-issues">
                    {preflight.issues.slice(0, 25).map((issue, index) => (
                      <li className={`issue-${issue.severity}`} key={`${issue.code}-${issue.row ?? "all"}-${index}`}>
                        <strong>{issue.severity}</strong>{issue.row ? ` · row ${issue.row}` : ""}: {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : <p className="preflight-ready">Ready to import locally.</p>}
              </>
            )}
          </section>

          <section className="import-card">
            <h2>4. Import locally</h2>
            <label className="project-name-field">Project name<input onChange={(event) => setProjectName(event.target.value)} value={projectName} /></label>
            <button className="primary-button import-button" disabled={!preflight?.ready || status.kind === "saving"} onClick={() => void importLocally()} type="button">
              {status.kind === "saving" ? "Importing…" : `Import ${preflight?.summary.sourceRows ?? 0} items locally`}
            </button>
            {status.message && <p className={status.kind === "error" ? "error-message" : "import-success"} role="status">{status.message}</p>}
          </section>
        </>
      )}
    </main>
  );
}
