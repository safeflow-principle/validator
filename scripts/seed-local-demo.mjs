import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./local-supabase-env.mjs";

const OWNER_EMAIL = process.env.SAFEFLOW_DEMO_OWNER_EMAIL || "owner@example.test";
const VALIDATOR_EMAIL = process.env.SAFEFLOW_DEMO_VALIDATOR_EMAIL || "validator@example.test";
const PASSWORD = process.env.SAFEFLOW_DEMO_PASSWORD || "safeflow-local-demo";
const { apiUrl, publishableKey, serviceRoleKey } = readLocalSupabaseStatus();
if (!serviceRoleKey) throw new Error("Local Supabase status did not return a service-role key. Nothing was changed.");

const admin = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function localUser(email) {
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const found = existing.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password: PASSWORD, email_confirm: true });
    if (error) throw error;
    return found;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { synthetic_local_demo: true } });
  if (error) throw error;
  return data.user;
}

await localUser(OWNER_EMAIL);
await localUser(VALIDATOR_EMAIL);

const owner = createClient(apiUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { error: signInError } = await owner.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
if (signInError) throw signInError;
const { data: memberships, error: membershipError } = await owner.from("workspace_members")
  .select("workspace_id,workspaces!inner(id,name)").not("accepted_at", "is", null);
if (membershipError) throw membershipError;
let workspaceId = memberships?.find((row) => row.workspaces?.name === "SafeFlow Local Demo")?.workspace_id;
if (!workspaceId) {
  const { data, error } = await owner.rpc("create_workspace", { workspace_name: "SafeFlow Local Demo" });
  if (error) throw error;
  workspaceId = data;
}
const { error: memberError } = await owner.rpc("add_existing_workspace_member", {
  target_workspace_id: workspaceId, member_email: VALIDATOR_EMAIL, member_role: "VALIDATOR",
});
if (memberError) throw memberError;
await owner.auth.signOut();

console.log("Created or refreshed disposable local demo identities and workspace:");
console.log(`  owner: ${OWNER_EMAIL}`);
console.log(`  validator: ${VALIDATOR_EMAIL}`);
console.log(`  password: ${PASSWORD}`);
console.log("These credentials are for the loopback Supabase instance only.");
