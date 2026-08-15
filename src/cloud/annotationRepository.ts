import type { Annotation, BlindedValidationItem, HumanValidationProgress, ProjectDetail, ProjectStatus } from "../core/types";
import type { AnnotationRepository } from "../repositories/annotationRepository";
import { getSupabaseClient } from "./client";
import { SupabaseProjectRepository } from "./repositories";

type ItemRow = { id: string; project_id: string; external_id: string | null; prompt: string; response: string; category_id: string | null; source_order: number };
type AnnotationRow = {
  id:string;item_id:string;project_id:string;validator_id:string;benchmark_pack_id:string;benchmark_pack_version:string;rubric_version:string;
  status:"draft"|"submitted";answers:Annotation["answers"];notes:string|null;evidence_spans:Annotation["evidenceSpans"];revision:number;
  created_at:string;updated_at:string;submitted_at:string|null;
};
function mapAnnotation(row: AnnotationRow): Annotation {
  return { id:row.id,itemId:row.item_id,projectId:row.project_id,validatorId:row.validator_id,benchmarkPackId:row.benchmark_pack_id,
    benchmarkPackVersion:row.benchmark_pack_version,rubricVersion:row.rubric_version,status:row.status,answers:row.answers,
    ...(row.notes ? {notes:row.notes}:{}),evidenceSpans:row.evidence_spans,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,
    ...(row.submitted_at ? {submittedAt:row.submitted_at}:{}) };
}

export class SupabaseAnnotationRepository implements AnnotationRepository {
  constructor(private readonly workspaceId: string) {}
  close() { /* shared Supabase session remains available */ }
  async validatorId(): Promise<string> {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Cloud sign-in is required.");
    return data.user.id;
  }
  getProjectDetail(projectId: string): Promise<ProjectDetail | undefined> { return new SupabaseProjectRepository(this.workspaceId).getProject(projectId); }
  async getBlindedProjectItems(projectId: string): Promise<BlindedValidationItem[]> {
    // Deliberately explicit projection: metadata, judge tables, reference labels, and other annotations are not retrieved.
    const { data,error }=await getSupabaseClient().from("validation_items").select("id,project_id,external_id,prompt,response,category_id,source_order").eq("project_id",projectId).order("source_order");
    if(error)throw error;
    return (data as ItemRow[]).map((row)=>({id:row.id,projectId:row.project_id,...(row.external_id?{externalId:row.external_id}:{}),prompt:row.prompt,response:row.response,...(row.category_id?{categoryId:row.category_id}:{})}));
  }
  async getProjectAnnotations(projectId:string):Promise<Annotation[]> {
    const userId=await this.validatorId();
    const {data,error}=await getSupabaseClient().from("annotations").select("id,item_id,project_id,validator_id,benchmark_pack_id,benchmark_pack_version,rubric_version,status,answers,notes,evidence_spans,revision,created_at,updated_at,submitted_at").eq("project_id",projectId).eq("validator_id",userId);
    if(error)throw error; return (data as AnnotationRow[]).map(mapAnnotation);
  }
  async saveAnnotation(annotation:Annotation):Promise<HumanValidationProgress>{
    const {error}=await getSupabaseClient().rpc("save_cloud_annotation",{payload:annotation}); if(error)throw error;
    const detail=await this.getProjectDetail(annotation.projectId); if(!detail)throw new Error("Cloud project not found after save."); return detail.progress;
  }
  async setProjectStatus(projectId:string,status:ProjectStatus):Promise<void>{
    if(!["VALIDATING","REVIEW","HUMAN_COMPLETE"].includes(status))return;
    const {error}=await getSupabaseClient().rpc("set_cloud_project_workflow_status",{target_project_id:projectId,next_status:status}); if(error)throw error;
  }
}

