import type { ProjectDetail, ProjectSummary, WorkspaceMode } from "../core/types";
import type { SafeFlowDatabase } from "../storage/database";

export interface ProjectRepository {
  readonly mode: WorkspaceMode;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectDetail | undefined>;
  deleteProject(projectId: string): Promise<void>;
}

export class IndexedDbProjectRepository implements ProjectRepository {
  readonly mode = "LOCAL" as const;
  constructor(private readonly database: SafeFlowDatabase) {}
  listProjects() { return this.database.listProjectSummaries(); }
  getProject(projectId: string) { return this.database.getProjectDetail(projectId); }
  deleteProject(projectId: string) { return this.database.deleteProject(projectId); }
}

