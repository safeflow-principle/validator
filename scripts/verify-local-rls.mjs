import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./local-supabase-env.mjs";

const { apiUrl, publishableKey } = readLocalSupabaseStatus();
const password = process.env.SAFEFLOW_LOCAL_DEMO_PASSWORD || "safeflow-local-demo";
const owner = createClient(apiUrl, publishableKey, { auth: { persistSession: false } });
const validator = createClient(apiUrl, publishableKey, { auth: { persistSession: false } });

async function signIn(client, email) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

await signIn(owner, process.env.SAFEFLOW_LOCAL_OWNER_EMAIL || "owner@example.test");
await signIn(validator, process.env.SAFEFLOW_LOCAL_VALIDATOR_EMAIL || "validator@example.test");

const { data: workspaces, error: workspaceError } = await owner.from("workspaces").select("id").eq("name", "SafeFlow Local Demo");
if (workspaceError) throw workspaceError;
assert.equal(workspaces.length, 1, "expected the seeded local workspace");

const stamp = Date.now();
const projectId = `local-rls-${stamp}`;
const itemId = `${projectId}-item`;
const now = new Date().toISOString();
const bundle = {
  project: { id: projectId, name: "Disposable RLS verification", benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "synthetic-local-test", status: "READY", createdAt: now, updatedAt: now },
  importRun: { sourceName: "synthetic-rls-check.json", sourceSha256: "a".repeat(64) },
  items: [{ id: itemId, externalId: `synthetic-${stamp}`, prompt: "Synthetic prompt for local authorization verification.", response: "Synthetic response.", categoryId: "synthetic", metadata: { importSourceRow: 1 }, createdAt: now }],
  annotations: [],
  referenceArtifacts: [{ id: `${itemId}-reference`, itemId, label: { synthetic: true }, provenance: "SafeFlow synthetic test", createdAt: now }],
  judgeArtifacts: [{ id: `${itemId}-judge`, itemId, judgeId: "synthetic-judge", score: 1, reasoning: "Synthetic hidden result.", metadata: {}, artifactHash: "b".repeat(64), createdAt: now }],
};

try {
  const { error: createError } = await owner.rpc("create_cloud_project_copy", { target_workspace_id: workspaces[0].id, bundle });
  if (createError) throw createError;

  const { data: beforeAssignment, error: beforeError } = await validator.from("projects").select("id").eq("id", projectId);
  if (beforeError) throw beforeError;
  assert.equal(beforeAssignment.length, 0, "unassigned validator must not see a project");

  const { error: assignError } = await owner.rpc("assign_project_validator", { target_project_id: projectId, member_email: process.env.SAFEFLOW_LOCAL_VALIDATOR_EMAIL || "validator@example.test" });
  if (assignError) throw assignError;

  const { data: assignedProjects, error: projectError } = await validator.from("projects").select("id").eq("id", projectId);
  if (projectError) throw projectError;
  assert.equal(assignedProjects.length, 1, "assigned validator must see the project");

  const { data: items, error: itemError } = await validator.from("validation_items").select("id,prompt,response").eq("project_id", projectId);
  if (itemError) throw itemError;
  assert.equal(items.length, 1, "assigned validator must see blinded validation items");

  const { data: judges, error: judgeError } = await validator.from("judge_artifacts").select("id").eq("item_id", itemId);
  if (judgeError) throw judgeError;
  assert.equal(judges.length, 0, "validator must not see judge artifacts");

  const { data: references, error: referenceError } = await validator.from("reference_artifacts").select("id").eq("item_id", itemId);
  if (referenceError) throw referenceError;
  assert.equal(references.length, 0, "validator must not see reference labels");

  const annotation = { id: `${itemId}-annotation`, itemId, projectId, benchmarkPackId: "air-bench-2024", benchmarkPackVersion: "synthetic-local-test", rubricVersion: "synthetic-local-test", status: "submitted", answers: { score: 1, confidence: "high" }, notes: "Synthetic validation note.", evidenceSpans: [], revision: 1, createdAt: now, updatedAt: now, submittedAt: now };
  const { error: saveError } = await validator.rpc("save_cloud_annotation", { payload: annotation });
  if (saveError) throw saveError;

  const { data: annotations, error: annotationError } = await owner.from("annotations").select("status,revision").eq("project_id", projectId);
  if (annotationError) throw annotationError;
  assert.deepEqual(annotations, [{ status: "submitted", revision: 1 }]);
  console.log("Local RLS verification passed: assignment gates project access; judge/reference artifacts remain blinded; validator annotation persisted.");
} finally {
  const { error } = await owner.rpc("delete_cloud_project", { target_project_id: projectId });
  if (error) console.error(`Cleanup warning: ${error.message}`);
  await owner.auth.signOut();
  await validator.auth.signOut();
}
