import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseDatasetText } from "../import/parser";
import { analyzeFinalizedArtifacts, analyzeScoreRecords, supportedAnalysisReportCsv, supportedAnalysisReportJson, type ScoreRecordInput } from "./supportedInterface";

type Arguments = Record<string, string | true>;

function parseArguments(values: string[]): Arguments {
  const result: Arguments = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument ${value}.`);
    const name = value.slice(2);
    if (name === "help") { result.help = true; continue; }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`--${name} requires a value.`);
    result[name] = next;
    index += 1;
  }
  return result;
}

function stringArgument(args: Arguments, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

async function scoreRecords(path: string, idField: string, scoreField: string): Promise<ScoreRecordInput[]> {
  const parsed = parseDatasetText(path, await readFile(path, "utf8"));
  const errors = parsed.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("; "));
  return parsed.rows.map((row) => ({ itemId: row[idField], score: row[scoreField] }));
}

function usage(): string {
  return `SafeFlow supported analysis interface

Record mode:
  npm run analyze -- --human human.csv --judge judge.csv --output report.json

Finalized-artifact mode:
  npm run analyze -- --finalization finalization.json --analysis analysis.json --output report.json

Options:
  --human-id-field FIELD       default: item_id
  --judge-id-field FIELD       default: item_id
  --human-score-field FIELD    default: score
  --judge-score-field FIELD    default: score
  --format json|csv            inferred from --output, default: json
  --output PATH                omit to write to stdout
`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const finalizationPath = stringArgument(args, "finalization");
  const analysisPath = stringArgument(args, "analysis");
  const humanPath = stringArgument(args, "human");
  const judgePath = stringArgument(args, "judge");
  const artifactMode = Boolean(finalizationPath || analysisPath);
  const recordMode = Boolean(humanPath || judgePath);
  if (artifactMode === recordMode) throw new Error("Choose exactly one mode: --human with --judge, or --finalization with --analysis.");
  if (artifactMode && (!finalizationPath || !analysisPath)) throw new Error("Finalized-artifact mode requires both --finalization and --analysis.");
  if (recordMode && (!humanPath || !judgePath)) throw new Error("Record mode requires both --human and --judge.");
  const report = artifactMode
    ? await analyzeFinalizedArtifacts(
      JSON.parse(await readFile(finalizationPath!, "utf8")),
      JSON.parse(await readFile(analysisPath!, "utf8")),
    )
    : analyzeScoreRecords(
      await scoreRecords(humanPath!, stringArgument(args, "human-id-field") ?? "item_id", stringArgument(args, "human-score-field") ?? "score"),
      await scoreRecords(judgePath!, stringArgument(args, "judge-id-field") ?? "item_id", stringArgument(args, "judge-score-field") ?? "score"),
    );
  const outputPath = stringArgument(args, "output");
  const format = stringArgument(args, "format") ?? (outputPath && extname(outputPath).toLowerCase() === ".csv" ? "csv" : "json");
  if (!(["json", "csv"] as const).includes(format as "json" | "csv")) throw new Error("--format must be json or csv.");
  const output = format === "csv" ? supportedAnalysisReportCsv(report) : supportedAnalysisReportJson(report);
  if (outputPath) await writeFile(outputPath, output, "utf8");
  else process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`Analysis failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
