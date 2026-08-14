import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  BenchmarkPack,
  NormalizedBenchmarkPrompt,
  NormalizedLevel3Relationship,
  NormalizedTaxonomyAsset,
  NormalizedTaxonomyAxisValue,
  NormalizedTaxonomyLeaf,
  NormalizedTaxonomyLevel,
} from "../src/core/types";

const OFFICIAL_DATASET_URL = "https://huggingface.co/datasets/stanford-crfm/air-bench-2024";
const OFFICIAL_PAPER_URL = "https://arxiv.org/abs/2407.17436";
const IMPORTER_VERSION = "1.1.0";

const CONCEPTUAL_LEVEL_3_NAMES = [
  "Confidentiality",
  "Integrity",
  "Availability",
  "Automated Decision-Making",
  "Autonomous Unsafe Operation of Systems",
  "Advice in Heavily Regulated Industries",
  "Supporting Malicious Organized Groups",
  "Celebrating Suffering",
  "Violent acts",
  "Depicting Violence",
  "Weapon Usage & Development",
  "Military and Warfare",
  "Harassment",
  "Hate Speech (Inciting/Promoting/Expressing hatred)",
  "Perpetuating Harmful Beliefs",
  "Offensive Language",
  "Adult content",
  "Erotic",
  "Non-Consensual Nudity",
  "Monetized",
  "Endangerment, Harm, or Abuse of Children",
  "Child Sexual Abuse",
  "Suicidal and non-suicidal self Injury",
  "Political Persuasion",
  "Influencing Politics",
  "Deterring Democratic Participation",
  "Disrupting Social Order (China-unique)",
  "High-Risk Financial Activities",
  "Unfair Market Practices",
  "Disempowering Workers",
  "Schemes",
  "Fraud",
  "Academic dishonesty",
  "Mis/disinformation",
  "Sowing Division",
  "Misrepresentation",
  "Types of Defamation",
  "Specific Types of Rights",
  "Discriminatory Activities",
  "Protected Characteristics",
  "Unauthorized Privacy Violations",
  "Types of Sensitive Data",
  "Illegal/Regulated substances/goods",
  "services/exploitation",
  "Other Illegal/Unlawful/Criminal Activities",
] as const;

const COMPOSITE_LEVEL_3 = {
  "3940": {
    nodes: [
      { id: "39", name: "Discriminatory Activities", role: "activity", displayLabel: "Activity" },
      { id: "40", name: "Protected Characteristics", role: "protected-characteristic", displayLabel: "Characteristic" },
    ] as const,
    leftValues: [
      "Discrimination in employment, benefits, or services",
      "Characterization of identity",
      "Classification of individuals",
    ],
    rightValues: [
      "Race", "Ethnicity", "Color", "Gender", "Sexual orientation", "Religion", "Beliefs", "Nationality",
      "Geographic region", "Caste", "Social behaviors", "Physical Characteristics", "Mental Characteristics",
      "Predicted Personality", "Health conditions", "Disability", "Pregnancy Status", "Genetic Information", "Occupation", "Age",
    ],
  },
  "4142": {
    nodes: [
      { id: "41", name: "Unauthorized Privacy Violations", role: "unauthorized-action", displayLabel: "Unauthorized action" },
      { id: "42", name: "Types of Sensitive Data", role: "sensitive-data-type", displayLabel: "Sensitive data" },
    ] as const,
    leftValues: [
      "Unauthorized generation",
      "Unauthorized disclosure",
      "Unauthorized distribution",
      "Unauthorized collection/gathering/stealing",
      "Unauthorized processing",
      "Unauthorized inference/synthesis",
      "Non-consensual tracking/monitoring/stalking/spyware",
      "Model Attacks (membership inference, model inversion)",
    ],
    rightValues: [
      "PII (Personal Identifiable Information)",
      "Health data",
      "Location data",
      "Demographic data",
      "Biometric data (facial recognition)",
      "Educational records",
      "Financial records",
      "Behavioral/ Preference data",
      "Communication Records",
    ],
  },
} as const;

const LEVEL_1_BY_LEVEL_2_INDEX: Readonly<Record<string, { id: string; name: string }>> = {
  "1": { id: "1", name: "System & Operational Risks" },
  "2": { id: "1", name: "System & Operational Risks" },
  "3": { id: "2", name: "Content Safety Risks" },
  "4": { id: "2", name: "Content Safety Risks" },
  "5": { id: "2", name: "Content Safety Risks" },
  "6": { id: "2", name: "Content Safety Risks" },
  "7": { id: "2", name: "Content Safety Risks" },
  "8": { id: "3", name: "Societal Risks" },
  "9": { id: "3", name: "Societal Risks" },
  "10": { id: "3", name: "Societal Risks" },
  "11": { id: "3", name: "Societal Risks" },
  "12": { id: "4", name: "Legal & Rights Risks" },
  "13": { id: "4", name: "Legal & Rights Risks" },
  "14": { id: "4", name: "Legal & Rights Risks" },
  "15": { id: "4", name: "Legal & Rights Risks" },
  "16": { id: "4", name: "Legal & Rights Risks" },
};

const EXPECTED_PROMPT_SET_KEYS = ["source", "domain", "prompts"] as const;
const EXPECTED_PROMPT_KEYS = ["id", "text", "prompt_type", "source", "domain", "risk_level", "notes", "metadata"] as const;
const EXPECTED_METADATA_KEYS = [
  "data_split", "slice", "category", "subcategory", "workflow", "intent", "expected_behavior", "original_source",
  "airbench_cate_idx", "airbench_l2", "airbench_l3", "airbench_l4", "airbench_region", "airbench_split",
] as const;
const EXPECTED_VALIDATION_KEYS = [
  "airbench_cate_idx", "airbench_l2", "airbench_l3", "airbench_l4", "airbench_region", "airbench_split",
  "category", "data_split", "expected_behavior", "intent", "origin_source", "prompt_id", "risk_level", "slice",
  "source", "subcategory", "text", "workflow",
] as const;

type JsonObject = Record<string, unknown>;

interface PromptSetRow {
  id: string;
  text: string;
  prompt_type: string;
  source: string;
  domain: string;
  risk_level: string;
  notes: null | string;
  metadata: Record<(typeof EXPECTED_METADATA_KEYS)[number], string>;
}

interface PromptSetFile {
  source: string;
  domain: string;
  prompts: PromptSetRow[];
}

type ValidationRow = Record<(typeof EXPECTED_VALIDATION_KEYS)[number], string>;

export interface ImportAirBenchOptions {
  promptSetPath: string;
  validationPath: string;
  outputDirectory: string;
  packPath?: string;
}

export interface ImportAirBenchResult {
  promptCount: number;
  uniquePromptIds: number;
  uniqueTexts: number;
  taxonomyLeafCount: number;
  taxonomyLevel3ValueCount: number;
  duplicateTextGroupCount: number;
  outputs: { prompts: string; taxonomy: string; manifest: string; pack?: string };
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: JsonObject, expected: readonly string[], location: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(wanted), `${location} keys differ: got [${actual.join(", ")}]`);
}

function assertStringFields(value: JsonObject, fields: readonly string[], location: string) {
  for (const field of fields) invariant(typeof value[field] === "string", `${location}.${field} must be a string`);
}

export function parsePromptSet(raw: string): PromptSetFile {
  const value: unknown = JSON.parse(raw);
  invariant(isObject(value), "prompt set must be an object");
  assertExactKeys(value, EXPECTED_PROMPT_SET_KEYS, "prompt set");
  invariant(typeof value.source === "string", "prompt set.source must be a string");
  invariant(typeof value.domain === "string", "prompt set.domain must be a string");
  invariant(Array.isArray(value.prompts), "prompt set.prompts must be an array");
  const prompts = value.prompts.map((candidate, index) => {
    invariant(isObject(candidate), `prompt set.prompts[${index}] must be an object`);
    assertExactKeys(candidate, EXPECTED_PROMPT_KEYS, `prompt set.prompts[${index}]`);
    assertStringFields(candidate, ["id", "text", "prompt_type", "source", "domain", "risk_level"], `prompt set.prompts[${index}]`);
    invariant(candidate.notes === null || typeof candidate.notes === "string", `prompt set.prompts[${index}].notes must be null or a string`);
    invariant(isObject(candidate.metadata), `prompt set.prompts[${index}].metadata must be an object`);
    assertExactKeys(candidate.metadata, EXPECTED_METADATA_KEYS, `prompt set.prompts[${index}].metadata`);
    assertStringFields(candidate.metadata, EXPECTED_METADATA_KEYS, `prompt set.prompts[${index}].metadata`);
    return candidate as unknown as PromptSetRow;
  });
  return { source: value.source, domain: value.domain, prompts };
}

export function parseValidationJsonl(raw: string): ValidationRow[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line, index) => {
    const candidate: unknown = JSON.parse(line);
    invariant(isObject(candidate), `validation line ${index + 1} must be an object`);
    assertExactKeys(candidate, EXPECTED_VALIDATION_KEYS, `validation line ${index + 1}`);
    assertStringFields(candidate, EXPECTED_VALIDATION_KEYS, `validation line ${index + 1}`);
    return candidate as ValidationRow;
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function officialLevel(id: string, name: string, sourceField: string): NormalizedTaxonomyLevel {
  return { id, name, authority: "official-air-bench-dataset", sourceField };
}

function paperLevel(id: string, name: string): NormalizedTaxonomyLevel {
  return { id, name, authority: "official-air-2024-paper" };
}

function displayAxisValue(sourceName: string): string {
  return sourceName === "PII (Personal Identifiable Information)" ? "Personally Identifiable Information" : sourceName;
}

function axisValue(nodeId: string, index: number, sourceName: string): NormalizedTaxonomyAxisValue {
  const displayName = displayAxisValue(sourceName);
  return {
    id: `${nodeId}.${index}`,
    sourceName,
    displayName,
    sourceAuthority: "official-air-bench-dataset",
    displayAuthority: displayName === sourceName ? "official-air-bench-dataset" : "safeflow-derived",
  };
}

function conceptualRelationship(level3Id: string, level4Id: string, level4Name: string): NormalizedLevel3Relationship {
  const composite = COMPOSITE_LEVEL_3[level3Id as keyof typeof COMPOSITE_LEVEL_3];
  if (!composite) return { kind: "single", nodeId: level3Id };
  const ordinal = Number(level4Id);
  invariant(Number.isInteger(ordinal) && ordinal > 0, `invalid composite Level-4 ordinal: ${level4Id}`);
  const rightCount = composite.rightValues.length;
  const leftIndex = Math.floor((ordinal - 1) / rightCount) + 1;
  const rightIndex = ((ordinal - 1) % rightCount) + 1;
  const leftName = composite.leftValues[leftIndex - 1];
  const rightName = composite.rightValues[rightIndex - 1];
  invariant(leftName && rightName, `composite Level-4 ordinal is out of range: ${level3Id}.${level4Id}`);
  invariant(level4Name === `${leftName} - ${rightName}`, `composite Level-4 name does not match encoded axes: ${level4Name}`);
  return {
    kind: "composite",
    dimensions: [
      {
        nodeId: composite.nodes[0].id,
        role: composite.nodes[0].role,
        displayLabel: composite.nodes[0].displayLabel,
        value: axisValue(composite.nodes[0].id, leftIndex, leftName),
      },
      {
        nodeId: composite.nodes[1].id,
        role: composite.nodes[1].role,
        displayLabel: composite.nodes[1].displayLabel,
        value: axisValue(composite.nodes[1].id, rightIndex, rightName),
      },
    ],
  };
}

function crossValidate(promptSet: PromptSetFile, rows: ValidationRow[]) {
  invariant(promptSet.prompts.length === rows.length, "structured files contain different row counts");
  const ids = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const prompt = promptSet.prompts[index];
    const row = rows[index];
    invariant(!ids.has(row.prompt_id), `duplicate prompt_id: ${row.prompt_id}`);
    ids.add(row.prompt_id);
    invariant(prompt.id === row.prompt_id, `row ${index}: id/prompt_id mismatch`);
    invariant(prompt.text === row.text, `row ${index}: prompt text mismatch`);
    const aliases: Array<[string, string, string]> = [
      [prompt.metadata.category, row.category, "category"],
      [prompt.metadata.subcategory, row.subcategory, "subcategory"],
      [prompt.metadata.workflow, row.workflow, "workflow"],
      [prompt.metadata.intent, row.intent, "intent"],
      [prompt.metadata.airbench_cate_idx, row.airbench_cate_idx, "airbench_cate_idx"],
      [prompt.metadata.airbench_l2, row.airbench_l2, "airbench_l2"],
      [prompt.metadata.airbench_l3, row.airbench_l3, "airbench_l3"],
      [prompt.metadata.airbench_l4, row.airbench_l4, "airbench_l4"],
      [prompt.metadata.airbench_region, row.airbench_region, "airbench_region"],
      [prompt.metadata.airbench_split, row.airbench_split, "airbench_split"],
      [prompt.metadata.data_split, row.data_split, "data_split"],
      [prompt.metadata.slice, row.slice, "slice"],
      [prompt.metadata.expected_behavior, row.expected_behavior, "expected_behavior"],
      [prompt.metadata.original_source, row.origin_source, "origin_source"],
    ];
    for (const [left, right, field] of aliases) invariant(left === right, `row ${index}: ${field} mismatch`);
    invariant(row.category === row.airbench_l2, `row ${index}: category is not the L2 alias`);
    invariant(row.subcategory === row.airbench_l3, `row ${index}: subcategory is not the L3 alias`);
    invariant(row.workflow === row.airbench_l4, `row ${index}: workflow is not the L4 alias`);
    invariant(row.intent === row.airbench_cate_idx, `row ${index}: intent is not the cate-idx alias`);
  }
}

function buildTaxonomy(rows: ValidationRow[]): NormalizedTaxonomyAsset {
  const leaves = new Map<string, NormalizedTaxonomyLeaf>();
  const conceptualLevel3Nodes = new Map<string, NormalizedTaxonomyLevel>(
    CONCEPTUAL_LEVEL_3_NAMES.map((name, index) => {
      const id = String(index + 1);
      return [id, paperLevel(id, name)];
    }),
  );
  for (const row of rows) {
    const [level2Id, level3Id, level4Id] = row.airbench_cate_idx.split(".");
    invariant(level2Id && level3Id && level4Id, `invalid AIR-BENCH cate-idx: ${row.airbench_cate_idx}`);
    const officialLevel1 = LEVEL_1_BY_LEVEL_2_INDEX[level2Id];
    invariant(officialLevel1, `no official Level 1 mapping for Level 2 index ${level2Id}`);
    const sourceLevel3 = officialLevel(level3Id, row.airbench_l3, "l3-name");
    const relationship = conceptualRelationship(level3Id, level4Id, row.airbench_l4);
    if (relationship.kind === "single") {
      const conceptualNode = conceptualLevel3Nodes.get(level3Id);
      invariant(conceptualNode, `unknown conceptual Level-3 node: ${level3Id}`);
      invariant(
        conceptualNode.name === row.airbench_l3,
        `source Level-3 name differs from conceptual node ${level3Id}: ${row.airbench_l3}`,
      );
    }
    const candidate: NormalizedTaxonomyLeaf = {
      categoryId: row.airbench_cate_idx,
      promptCount: 1,
      level1: paperLevel(officialLevel1.id, officialLevel1.name),
      level2: officialLevel(level2Id, row.airbench_l2, "l2-name"),
      sourceLevel3,
      conceptualLevel3: relationship,
      level4: officialLevel(row.airbench_cate_idx, row.airbench_l4, "l4-name"),
    };
    const existing = leaves.get(candidate.categoryId);
    if (!existing) {
      leaves.set(candidate.categoryId, candidate);
      continue;
    }
    invariant(
      existing.level1.name === candidate.level1.name && existing.level2.name === candidate.level2.name
        && existing.sourceLevel3.name === candidate.sourceLevel3.name
        && JSON.stringify(existing.conceptualLevel3) === JSON.stringify(candidate.conceptualLevel3)
        && existing.level4.name === candidate.level4.name,
      `category ${candidate.categoryId} maps to conflicting taxonomy paths`,
    );
    existing.promptCount += 1;
  }
  const sortedLeaves = [...leaves.values()].sort((a, b) => {
    const aParts = a.categoryId.split(".").map(Number);
    const bParts = b.categoryId.split(".").map(Number);
    return aParts[0] - bParts[0] || aParts[1] - bParts[1] || aParts[2] - bParts[2];
  });
  const sortedNodes = [...conceptualLevel3Nodes.values()].sort((a, b) => Number(a.id) - Number(b.id));
  invariant(sortedNodes.length === 45, `expected 45 conceptual Level-3 nodes, found ${sortedNodes.length}`);
  return { schemaVersion: "1.1", benchmarkId: "air-bench-2024", conceptualLevel3Nodes: sortedNodes, leaves: sortedLeaves };
}

function normalizePrompts(rows: ValidationRow[]): NormalizedBenchmarkPrompt[] {
  return rows.map((row, sourceRowIndex) => ({
    schemaVersion: "1.0",
    id: `air-bench-2024:default:test:${row.prompt_id}`,
    text: row.text,
    contentSha256: sha256(row.text),
    categoryId: row.airbench_cate_idx,
    source: {
      benchmark: "AIR-BENCH 2024",
      dataset: "stanford-crfm/air-bench-2024",
      configuration: row.airbench_region,
      split: row.airbench_split,
      sourceRowIndex,
    },
    llmEvalClean: {
      promptId: row.prompt_id,
      dataSplit: row.data_split,
      slice: row.slice,
      expectedBehavior: row.expected_behavior,
    },
  }));
}

function taxonomyDescription(leaf: NormalizedTaxonomyLeaf): string {
  if (leaf.conceptualLevel3.kind === "single") {
    return `${leaf.level1.name} > ${leaf.level2.name} > ${leaf.sourceLevel3.name} > ${leaf.level4.name}`;
  }
  return `${leaf.level1.name} > ${leaf.level2.name} | ${leaf.conceptualLevel3.dimensions.map((dimension) => `${dimension.displayLabel}: ${dimension.value.displayName}`).join(" | ")}`;
}

function populatePack(pack: BenchmarkPack, taxonomy: NormalizedTaxonomyLeaf[]): BenchmarkPack {
  return {
    ...pack,
    version: "2024.1-local-source-import",
    description: {
      kind: "safeflow-interpretation",
      text: "AIR-BENCH 2024 prompt and taxonomy metadata normalized from the official dataset fields preserved by llm_eval_clean. Category-specific judge rubrics are not included in the inspected source artifacts.",
      citation: OFFICIAL_DATASET_URL,
    },
    provenance: {
      benchmark: "AIR-BENCH",
      benchmarkVersion: "2024",
      sourceUrl: OFFICIAL_DATASET_URL,
      notes: [
        "The 314 category IDs and Level 2/3/4 names are generated from AIR-BENCH source fields in the inspected local artifacts.",
        "Level 1 names and Level 2-to-Level 1 grouping follow the AIR-BENCH 2024 paper.",
        "llm_eval_clean aliases and SafeFlow mappings are documented separately in generated/source-manifest.json.",
        "Official category-specific judge prompts/rubrics were not present in the inspected source files and remain unavailable.",
      ],
    },
    categories: taxonomy.map((leaf) => ({
      id: leaf.categoryId,
      name: leaf.level4.name,
      description: {
        kind: "safeflow-interpretation",
        text: taxonomyDescription(leaf),
        citation: OFFICIAL_DATASET_URL,
        note: "SafeFlow-assembled path using official dataset Level 2/3/4 values and the paper-defined Level 1 grouping.",
      },
      rubric: {
        kind: "unavailable",
        note: `No official category-specific judge prompt or human rubric was present in the inspected prompt artifacts for ${leaf.categoryId}.`,
      },
    })),
  };
}

export async function importAirBenchSources(options: ImportAirBenchOptions): Promise<ImportAirBenchResult> {
  const promptSetPath = resolve(options.promptSetPath);
  const validationPath = resolve(options.validationPath);
  const outputDirectory = resolve(options.outputDirectory);
  const [promptSetRaw, validationRaw] = await Promise.all([
    readFile(promptSetPath, "utf8"),
    readFile(validationPath, "utf8"),
  ]);
  const promptSet = parsePromptSet(promptSetRaw);
  const rows = parseValidationJsonl(validationRaw);
  crossValidate(promptSet, rows);
  const taxonomy = buildTaxonomy(rows);
  const prompts = normalizePrompts(rows);
  const textGroups = new Map<string, number>();
  for (const prompt of prompts) textGroups.set(prompt.text, (textGroups.get(prompt.text) ?? 0) + 1);
  const duplicateTextGroupCount = [...textGroups.values()].filter((count) => count > 1).length;
  const taxonomyLevel3ValueCount = new Set(taxonomy.leaves.map((leaf) => `${leaf.level2.id}.${leaf.sourceLevel3.id}:${leaf.sourceLevel3.name}`)).size;

  const promptsPath = resolve(outputDirectory, "prompts.jsonl");
  const taxonomyPath = resolve(outputDirectory, "taxonomy.json");
  const manifestPath = resolve(outputDirectory, "source-manifest.json");
  const manifest = {
    schemaVersion: "1.0",
    importerVersion: IMPORTER_VERSION,
    benchmark: "AIR-BENCH 2024",
    officialSources: { dataset: OFFICIAL_DATASET_URL, paper: OFFICIAL_PAPER_URL },
    inputArtifacts: [
      { role: "llm_eval_clean PromptSpec export", fileName: basename(promptSetPath), sha256: sha256(promptSetRaw), rows: promptSet.prompts.length },
      { role: "llm_eval_clean flattened validation prompts", fileName: basename(validationPath), sha256: sha256(validationRaw), rows: rows.length },
    ],
    counts: {
      prompts: prompts.length,
      uniquePromptIds: new Set(rows.map((row) => row.prompt_id)).size,
      uniquePromptTexts: textGroups.size,
      duplicateTextGroups: duplicateTextGroupCount,
      level1: new Set(taxonomy.leaves.map((leaf) => leaf.level1.id)).size,
      level2: new Set(taxonomy.leaves.map((leaf) => leaf.level2.id)).size,
      observedLevel3Values: taxonomyLevel3ValueCount,
      officialConceptualLevel3Nodes: taxonomy.conceptualLevel3Nodes.length,
      level4: taxonomy.leaves.length,
    },
    fieldProvenance: {
      officialAirBenchDataset: {
        text: "prompt",
        categoryId: "cate-idx",
        level2Name: "l2-name",
        level3Name: "l3-name",
        level4Name: "l4-name",
      },
      llmEvalCleanRenamedCopies: {
        text: "text",
        categoryId: "airbench_cate_idx",
        level2Name: "airbench_l2",
        level3Name: "airbench_l3",
        level4Name: "airbench_l4",
      },
      llmEvalCleanDerivedAliases: {
        category: "copy of airbench_l2",
        subcategory: "copy of airbench_l3",
        workflow: "copy of airbench_l4",
        intent: "copy of airbench_cate_idx",
        prompt_id: "cate-idx plus global source row index, separated by ::",
        expected_behavior: "pipeline label; constant refuse in these artifacts",
        slice: "pipeline label; constant stress in these artifacts",
        data_split: "pipeline split label; constant airbench_default_test in these artifacts",
      },
      safeFlowDerived: {
        id: "namespaced llm_eval_clean prompt_id",
        contentSha256: "SHA-256 of exact prompt text",
        level1: "paper-defined Level 1 mapped from the official Level 2 numeric index",
        conceptualLevel3: "45-node paper taxonomy represented separately from the 43 source encodings",
        compositeAxes: "3940 resolves to activity by protected characteristic; 4142 resolves to unauthorized action by sensitive-data type",
      },
    },
    knownDiscrepancies: [
      "The paper reports 45 Level 3 categories; the dataset exposes 43 Level 3 string values because IDs 39/40 and 41/42 are combined.",
      "The paper describes 5,694 unique test cases; these artifacts contain 5,694 unique IDs but 5,692 unique prompt texts.",
      "The paper describes 15-30 prompts per Level 4 category; four category IDs contain 12 rows in these artifacts.",
      "The prompt-space HTML reads legacy top-level taxonomy keys and therefore displays blank L2/L3/L4 metadata despite nested metadata being present.",
    ],
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(promptsPath, `${prompts.map((prompt) => JSON.stringify(prompt)).join("\n")}\n`),
    writeFile(taxonomyPath, stableJson(taxonomy)),
    writeFile(manifestPath, stableJson(manifest)),
  ]);

  let writtenPackPath: string | undefined;
  if (options.packPath) {
    writtenPackPath = resolve(options.packPath);
    const pack = JSON.parse(await readFile(writtenPackPath, "utf8")) as BenchmarkPack;
    await mkdir(dirname(writtenPackPath), { recursive: true });
    await writeFile(writtenPackPath, stableJson(populatePack(pack, taxonomy.leaves)));
  }

  return {
    promptCount: prompts.length,
    uniquePromptIds: new Set(rows.map((row) => row.prompt_id)).size,
    uniqueTexts: textGroups.size,
    taxonomyLeafCount: taxonomy.leaves.length,
    taxonomyLevel3ValueCount,
    duplicateTextGroupCount,
    outputs: { prompts: promptsPath, taxonomy: taxonomyPath, manifest: manifestPath, ...(writtenPackPath ? { pack: writtenPackPath } : {}) },
  };
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const promptSetPath = argumentValue(args, "--prompt-set");
  const validationPath = argumentValue(args, "--validation");
  const outputDirectory = argumentValue(args, "--output") ?? "benchmark-packs/air-bench-2024/generated";
  const packPath = argumentValue(args, "--pack") ?? "benchmark-packs/air-bench-2024/pack.json";
  invariant(promptSetPath, "Usage: npm run import:airbench -- --prompt-set <json> --validation <jsonl> [--output <dir>] [--pack <json>]");
  invariant(validationPath, "--validation is required");
  const result = await importAirBenchSources({ promptSetPath, validationPath, outputDirectory, packPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
