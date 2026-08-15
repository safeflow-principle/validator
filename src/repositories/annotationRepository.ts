import type { Annotation, BlindedValidationItem, HumanValidationProgress, ProjectDetail, ProjectStatus } from "../core/types";
import type { SafeFlowDatabase } from "../storage/database";
import type { HumanValidationFinalization } from "../finalization/types";

export interface AnnotationRepository {
  close(): void;
  validatorId(): Promise<string>;
  getProjectDetail(projectId: string): Promise<ProjectDetail | undefined>;
  getBlindedProjectItems(projectId: string): Promise<BlindedValidationItem[]>;
  getProjectAnnotations(projectId: string): Promise<Annotation[]>;
  saveAnnotation(annotation: Annotation): Promise<HumanValidationProgress>;
  setProjectStatus(projectId: string, status: ProjectStatus): Promise<void>;
  getLatestHumanValidationFinalization?(projectId: string): Promise<HumanValidationFinalization | undefined>;
}

export class IndexedDbAnnotationRepository implements AnnotationRepository {
  constructor(private readonly database: SafeFlowDatabase, private readonly localValidatorId: string) {}
  close() { this.database.close(); }
  async validatorId() { return this.localValidatorId; }
  getProjectDetail(projectId: string) { return this.database.getProjectDetail(projectId); }
  getBlindedProjectItems(projectId: string) { return this.database.getBlindedProjectItems(projectId); }
  getProjectAnnotations(projectId: string) { return this.database.getProjectAnnotations(projectId, this.localValidatorId); }
  saveAnnotation(annotation: Annotation) { return this.database.saveAnnotation(annotation); }
  setProjectStatus(projectId: string, status: ProjectStatus) { return this.database.setProjectStatus(projectId, status); }
  getLatestHumanValidationFinalization(projectId: string) { return this.database.getLatestHumanValidationFinalization(projectId); }
}
