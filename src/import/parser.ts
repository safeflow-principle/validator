import type { DatasetFormat, DatasetRow, ImportIssue, ParsedDataset } from "./types";

function inferFormat(filename: string): DatasetFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  throw new Error("Unsupported file type. Choose a .csv, .json, .jsonl, or .ndjson file.");
}

function objectRow(value: unknown, location: string): DatasetRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${location} must be a JSON object.`);
  }
  return value as DatasetRow;
}

function columnsFor(rows: readonly DatasetRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

function parseJson(text: string): DatasetRow[] {
  const value: unknown = JSON.parse(text);
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { rows?: unknown }).rows)
      ? (value as { rows: unknown[] }).rows
      : typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items)
        ? (value as { items: unknown[] }).items
        : null;
  if (!candidates) throw new Error("JSON must be an array or an object containing a rows or items array.");
  return candidates.map((row, index) => objectRow(row, `JSON row ${index + 1}`));
}

function parseJsonl(text: string): DatasetRow[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    return [objectRow(JSON.parse(line), `JSONL line ${index + 1}`)];
  });
}

function csvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function parseCsv(text: string): { rows: DatasetRow[]; issues: ImportIssue[] } {
  const cells = csvCells(text);
  if (!cells.length) return { rows: [], issues: [] };
  const headers = cells[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers must not be empty.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");
  const issues: ImportIssue[] = [];
  const rows = cells.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      issues.push({
        severity: "error",
        code: "csv-column-count",
        message: `Expected ${headers.length} columns but found ${values.length}.`,
        row: index + 2,
      });
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
  });
  return { rows, issues };
}

export function parseDatasetText(filename: string, text: string): ParsedDataset {
  const format = inferFormat(filename);
  try {
    const parsed = format === "csv" ? parseCsv(text) : { rows: format === "json" ? parseJson(text) : parseJsonl(text), issues: [] };
    if (!parsed.rows.length) {
      parsed.issues.push({ severity: "error", code: "empty-dataset", message: "The dataset contains no rows." });
    }
    return { format, columns: columnsFor(parsed.rows), rows: parsed.rows, issues: parsed.issues };
  } catch (error) {
    return {
      format,
      columns: [],
      rows: [],
      issues: [{ severity: "error", code: "parse-failed", message: error instanceof Error ? error.message : "Could not parse dataset." }],
    };
  }
}
