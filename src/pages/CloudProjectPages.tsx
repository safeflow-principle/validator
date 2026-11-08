import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../cloud/client";
import { SupabaseAnnotationRepository } from "../cloud/annotationRepository";
import type { Annotation, BlindedValidationItem, ProjectDetail } from "../core/types";
import { ProjectAnnotationPage } from "./ProjectAnnotationPage";
import { assignCloudProjectValidator, listCloudWorkspaces } from "../cloud/repositories";

async function workspaceForProject(projectId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().from("projects").select("workspace_id").eq("id", projectId).single();
  if (error) throw error;
  return (data as { workspace_id: string }).workspace_id;
}

export function CloudProjectAnnotationPage({ projectId }: { projectId: string }) {
  const factory = useCallback(async () => new SupabaseAnnotationRepository(await workspaceForProject(projectId)), [projectId]);
  return <ProjectAnnotationPage projectBasePath="/cloud/projects" projectId={projectId} repositoryFactory={factory} />;
}

function useCloudHumanProject(projectId: string) {
  const [value, setValue] = useState<{ detail: ProjectDetail; items: BlindedValidationItem[]; annotations: Annotation[]; role?: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void workspaceForProject(projectId).then(async (workspaceId) => {
      const repository = new SupabaseAnnotationRepository(workspaceId);
      const [detail, items, annotations, workspaces] = await Promise.all([repository.getProjectDetail(projectId), repository.getBlindedProjectItems(projectId), repository.getProjectAnnotations(projectId), listCloudWorkspaces()]);
      if (!detail) throw new Error("Cloud project not found.");
      if (active) setValue({ detail, items, annotations, role: workspaces.find((entry) => entry.workspace.id === workspaceId)?.membership.role });
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not open cloud project."); });
    return () => { active = false; };
  }, [projectId]);
  return { value, error };
}

export function CloudProjectDetailPage({ projectId }: { projectId: string }) {
  const { value, error } = useCloudHumanProject(projectId);
  const [validatorEmail, setValidatorEmail] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState<string>();
  if (error) return <main className="project-shell"><h1>Could not open cloud project</h1><p role="alert">{error}</p><a href="/cloud">Cloud Workspace</a></main>;
  if (!value) return <main className="loading-screen"><p>Loading cloud project…</p></main>;
  const { detail } = value;
  async function assignValidator(event: React.FormEvent) {
    event.preventDefault(); setAssignmentMessage("Assigning validator…");
    try { await assignCloudProjectValidator(projectId, validatorEmail); setValidatorEmail(""); setAssignmentMessage("Validator assigned to this project."); }
    catch (reason) { setAssignmentMessage(reason instanceof Error ? reason.message : "Could not assign validator."); }
  }
  const started = detail.progress.drafts + detail.progress.submitted > 0;
  const complete = detail.progress.total > 0 && detail.progress.submitted === detail.progress.total;
  return <main className="project-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href="/cloud">Cloud Workspace</a></header><span className="status-pill">CLOUD · {detail.project.status}</span><h1>{detail.project.name}</h1><p>This project is stored in your authenticated SafeFlow cloud workspace and may be accessed by authorized workspace members.</p><section className="detail-grid"><article className="detail-card"><h2>Project information</h2><dl><div><dt>Benchmark</dt><dd>{detail.project.benchmarkPackId}</dd></div><div><dt>Benchmark-pack version</dt><dd>{detail.project.benchmarkPackVersion}</dd></div><div><dt>Source filename</dt><dd>{detail.sourceName}</dd></div><div><dt>Source SHA-256</dt><dd className="hash-value">{detail.importRun?.sourceSha256 ?? "Unavailable"}</dd></div><div><dt>Total items</dt><dd>{detail.progress.total}</dd></div></dl></article><article className="detail-card"><h2>Human-validation progress</h2><dl className="progress-breakdown"><div><dt>Unseen</dt><dd>{detail.progress.unseen}</dd></div><div><dt>Draft</dt><dd>{detail.progress.drafts}</dd></div><div><dt>Submitted</dt><dd>{detail.progress.submitted}</dd></div><div><dt>Flagged</dt><dd>{detail.progress.flagged}</dd></div><div><dt>Low confidence</dt><dd>{detail.progress.lowConfidence}</dd></div></dl><progress max="100" value={detail.progress.percentComplete}/><strong>{detail.progress.percentComplete}% complete</strong></article></section>{value.role === "OWNER" && <section className="backup-restore-card"><div><strong>Assign a validator</strong><p>The account must already be an accepted VALIDATOR member of this workspace.</p></div><form onSubmit={assignValidator}><label>Email<input onChange={(event) => setValidatorEmail(event.target.value)} required type="email" value={validatorEmail} /></label><button className="secondary-link button-link" type="submit">Assign to project</button></form>{assignmentMessage && <p role="status">{assignmentMessage}</p>}</section>}{complete && <section className="completion-banner"><h2>Human validation complete</h2><p>Automated-judge results remain blinded.</p></section>}<div className="page-actions">{!complete && <a className="primary-link" href={`/cloud/projects/${projectId}/annotate`}>{started?"Resume Validation":"Start Validation"}</a>}<a className={complete?"primary-link":"secondary-link button-link"} href={`/cloud/projects/${projectId}/review`}>{complete?"Review Before Finalization":"Review Annotations"}</a></div></main>;
}

export function CloudProjectReviewPage({ projectId }: { projectId: string }) {
  const { value, error } = useCloudHumanProject(projectId);
  const byItem = useMemo(() => new Map(value?.annotations.map((annotation) => [annotation.itemId, annotation]) ?? []), [value]);
  if (error) return <main className="project-shell"><h1>Could not open review</h1><p role="alert">{error}</p></main>;
  if (!value) return <main className="loading-screen"><p>Loading human annotations…</p></main>;
  const complete=value.detail.progress.total>0&&value.detail.progress.submitted===value.detail.progress.total;
  return <main className="project-shell review-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a><a href={`/cloud/projects/${projectId}`}>Project overview</a></header><span className="eyebrow">CLOUD · HUMAN ANNOTATIONS ONLY</span><h1>Review annotations</h1>{complete&&<section className="completion-banner"><h2>Human validation complete</h2><p>All included items have submitted human annotations. Automated-judge results remain blinded.</p></section>}<div className="review-list">{value.items.map((item)=>{const annotation=byItem.get(item.id);return <article className="review-card" key={item.id}><div><span className="eyebrow">{item.externalId??item.id}</span><h2>{item.categoryId??"Uncategorized"}</h2></div><dl><div><dt>Human score</dt><dd>{annotation?.answers.score??"Incomplete"}</dd></div><div><dt>Confidence</dt><dd>{annotation?.answers.confidence??"—"}</dd></div><div><dt>Reason</dt><dd>{annotation?.answers.reasoning??"—"}</dd></div><div><dt>Evidence</dt><dd>{annotation?.evidenceSpans.map((span)=>span.text).join(" · ")||"—"}</dd></div></dl><a className="secondary-link button-link" href={`/cloud/projects/${projectId}/annotate?item=${item.id}`}>Open for editing</a></article>})}</div></main>;
}
