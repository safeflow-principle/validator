import type { CloudWorkspace, ProjectDetail, ProjectStatus, ProjectSummary, WorkspaceMember, WorkspaceRole } from "../core/types";
import { getSupabaseClient } from "./client";
import type { ProjectRepository } from "../repositories/projectRepository";

type SummaryRow = {
  id: string; workspace_id: string; created_by: string; name: string; benchmark_pack_id: string;
  benchmark_pack_version: string; status: ProjectStatus; created_at: string; updated_at: string;
  source_name: string | null; source_sha256: string | null; total: number; unseen: number; drafts: number; submitted: number;
  flagged: number; low_confidence: number; skipped: number; percent_complete: number; last_activity_at: string;
  migrated_from_local_project_id: string | null;
};

function mapSummary(row: SummaryRow): ProjectSummary {
  return {
    project: {
      id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by, name: row.name,
      benchmarkPackId: row.benchmark_pack_id, benchmarkPackVersion: row.benchmark_pack_version,
      workspaceMode: "CLOUD", status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
      ...(row.migrated_from_local_project_id ? { migratedFromLocalProjectId: row.migrated_from_local_project_id } : {}),
    },
    sourceName: row.source_name ?? "Cloud dataset",
    lastActivityAt: row.last_activity_at,
    progress: {
      total: row.total, unseen: row.unseen, drafts: row.drafts, submitted: row.submitted,
      flagged: row.flagged, lowConfidence: row.low_confidence, skipped: row.skipped,
      percentComplete: row.percent_complete,
    },
  };
}

export class SupabaseProjectRepository implements ProjectRepository {
  readonly mode = "CLOUD" as const;
  constructor(private readonly workspaceId: string) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const { data, error } = await getSupabaseClient().from("cloud_project_summaries")
      .select("*").eq("workspace_id", this.workspaceId).order("last_activity_at", { ascending: false });
    if (error) throw error;
    return (data as SummaryRow[]).map(mapSummary);
  }

  async getProject(projectId: string): Promise<ProjectDetail | undefined> {
    const { data, error } = await getSupabaseClient().from("cloud_project_summaries")
      .select("*").eq("workspace_id", this.workspaceId).eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const row = data as SummaryRow;
    return {
      ...mapSummary(row),
      importRun: {
        id: `${row.id}:cloud-import`, projectId: row.id, sourceName: row.source_name ?? "Cloud dataset", sourceSha256: row.source_sha256 ?? undefined,
        status: "complete", itemCount: row.total, errors: [], format: "cloud-normalized", createdAt: row.created_at,
      },
    };
  }

  async deleteProject(projectId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc("delete_cloud_project", { target_project_id: projectId });
    if (error) throw error;
  }
}

export async function listCloudWorkspaces(): Promise<Array<{ workspace: CloudWorkspace; membership: WorkspaceMember }>> {
  const { data, error } = await getSupabaseClient().from("workspace_members").select("workspace_id,user_id,role,invited_at,accepted_at,workspaces!inner(id,name,created_by,created_at)").not("accepted_at", "is", null);
  if (error) throw error;
  return (data ?? []).map((value) => {
    const row = value as unknown as { workspace_id: string; user_id: string; role: WorkspaceRole; invited_at: string; accepted_at: string; workspaces: { id: string; name: string; created_by: string; created_at: string } };
    return {
      workspace: { id: row.workspaces.id, name: row.workspaces.name, createdBy: row.workspaces.created_by, createdAt: row.workspaces.created_at },
      membership: { workspaceId: row.workspace_id, userId: row.user_id, role: row.role, invitedAt: row.invited_at, acceptedAt: row.accepted_at },
    };
  });
}

export async function createCloudWorkspace(name: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("create_workspace", { workspace_name: name.trim() });
  if (error) throw error;
  return data as string;
}

export async function addExistingWorkspaceMember(workspaceId: string, email: string, role: Exclude<WorkspaceRole, "OWNER">): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("add_existing_workspace_member", {
    target_workspace_id: workspaceId, member_email: email.trim(), member_role: role,
  });
  if (error) throw error;
  return data as string;
}
