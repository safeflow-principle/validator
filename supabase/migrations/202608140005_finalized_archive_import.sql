-- Atomically copy a complete local archive, including its immutable research chain.
-- Snapshot JSON is preserved byte-for-value; local provenance remains historical provenance.
create function public.create_cloud_project_archive_copy(target_workspace_id uuid, bundle jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  project jsonb := bundle->'project'; item jsonb; annotation jsonb; judge jsonb; reference jsonb;
  finalization jsonb; finalized_item jsonb; analysis jsonb; comparison jsonb; report jsonb; audit jsonb;
  project_id text := project->>'id'; project_status public.project_status := (project->>'status')::public.project_status;
begin
  if private.workspace_role_for(target_workspace_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  if project_id is null or jsonb_array_length(bundle->'items') = 0 then raise exception 'Archive project and items are required'; end if;
  if project_status in ('HUMAN_FINALIZED','UNBLINDED') and jsonb_array_length(coalesce(bundle->'humanValidationFinalizations','[]'::jsonb)) <> 1
    then raise exception 'A finalized archive requires exactly one human finalization'; end if;
  if project_status = 'UNBLINDED' and jsonb_array_length(coalesce(bundle->'judgeAnalyses','[]'::jsonb)) <> 1
    then raise exception 'An unblinded archive requires exactly one judge analysis'; end if;

  insert into public.projects(id,workspace_id,created_by,name,benchmark_pack_id,benchmark_pack_version,status,source_name,source_sha256,migrated_from_local_project_id,created_at,updated_at)
  values(project_id,target_workspace_id,auth.uid(),project->>'name',project->>'benchmarkPackId',project->>'benchmarkPackVersion',project_status,
    bundle#>>'{importRun,sourceName}',bundle#>>'{importRun,sourceSha256}',project_id,(project->>'createdAt')::timestamptz,(project->>'updatedAt')::timestamptz);

  for item in select value from jsonb_array_elements(bundle->'items') loop
    insert into public.validation_items(id,project_id,external_id,prompt,response,category_id,metadata,source_order,created_at)
    values(item->>'id',project_id,item->>'externalId',item->>'prompt',item->>'response',item->>'categoryId',coalesce(item->'metadata','{}'::jsonb),
      coalesce((item#>>'{metadata,importSourceRow}')::integer,1),(item->>'createdAt')::timestamptz);
  end loop;
  for annotation in select value from jsonb_array_elements(coalesce(bundle->'annotations','[]'::jsonb)) loop
    insert into public.annotations(id,item_id,project_id,validator_id,benchmark_pack_id,benchmark_pack_version,rubric_version,status,answers,notes,evidence_spans,revision,created_at,updated_at,submitted_at)
    values(annotation->>'id',annotation->>'itemId',project_id,auth.uid(),annotation->>'benchmarkPackId',coalesce(annotation->>'benchmarkPackVersion',project->>'benchmarkPackVersion'),
      coalesce(annotation->>'rubricVersion',project->>'benchmarkPackVersion'),annotation->>'status',coalesce(annotation->'answers','{}'::jsonb),annotation->>'notes',
      coalesce(annotation->'evidenceSpans','[]'::jsonb),(annotation->>'revision')::integer,(annotation->>'createdAt')::timestamptz,(annotation->>'updatedAt')::timestamptz,
      nullif(annotation->>'submittedAt','')::timestamptz);
  end loop;
  for judge in select value from jsonb_array_elements(coalesce(bundle->'judgeArtifacts','[]'::jsonb)) loop
    insert into public.judge_artifacts(id,item_id,judge_id,score,reasoning,metadata,artifact_sha256,created_at)
    values(judge->>'id',judge->>'itemId',judge->>'judgeId',judge->'score',judge->>'reasoning',coalesce(judge->'metadata','{}'::jsonb),judge->>'artifactHash',(judge->>'createdAt')::timestamptz);
  end loop;
  for reference in select value from jsonb_array_elements(coalesce(bundle->'referenceArtifacts','[]'::jsonb)) loop
    insert into public.reference_artifacts(id,item_id,label,provenance,created_at)
    values(reference->>'id',reference->>'itemId',reference->'label',reference->>'provenance',(reference->>'createdAt')::timestamptz);
  end loop;

  for finalization in select value from jsonb_array_elements(coalesce(bundle->'humanValidationFinalizations','[]'::jsonb)) loop
    if finalization->>'projectId' <> project_id then raise exception 'Finalization project mismatch'; end if;
    insert into public.human_validation_finalizations(id,project_id,finalization_sequence,schema_version,snapshot_sha256,source_sha256,benchmark_pack_id,
      benchmark_pack_version,rubric_version,item_count,finalized_by,finalized_at,snapshot)
    values(finalization->>'id',project_id,(finalization->>'finalizationSequence')::integer,finalization->>'schemaVersion',finalization->>'snapshotHash',
      finalization#>>'{source,fileSha256}',finalization#>>'{benchmark,benchmarkId}',finalization#>>'{benchmark,benchmarkPackVersion}',finalization#>>'{benchmark,rubricVersion}',
      jsonb_array_length(finalization->'annotations'),auth.uid(),(finalization->>'finalizedAt')::timestamptz,finalization);
    for finalized_item in select value from jsonb_array_elements(finalization->'annotations') loop
      insert into public.human_finalization_items(finalization_id,item_id,annotation_id,annotation_revision,human_score,snapshot)
      values(finalization->>'id',finalized_item->>'itemId',finalized_item->>'annotationId',(finalized_item->>'annotationRevision')::integer,
        coalesce((finalized_item->>'numericValue')::numeric,(finalized_item->>'labelId')::numeric),finalized_item);
    end loop;
  end loop;

  for analysis in select value from jsonb_array_elements(coalesce(bundle->'judgeAnalyses','[]'::jsonb)) loop
    if analysis->>'projectId' <> project_id then raise exception 'Analysis project mismatch'; end if;
    if not exists(select 1 from public.human_validation_finalizations f where f.id=analysis->>'finalizationId' and f.snapshot_sha256=analysis->>'finalizationHash')
      then raise exception 'Analysis does not reference the imported finalization hash'; end if;
    insert into public.judge_analyses(id,project_id,finalization_id,schema_version,finalization_sha256,judge_artifact_set_sha256,analysis_sha256,judge_id,item_count,created_by,created_at,snapshot)
    values(analysis->>'id',project_id,analysis->>'finalizationId',analysis->>'schemaVersion',analysis->>'finalizationHash',analysis->>'judgeArtifactSetHash',
      analysis->>'analysisHash',analysis->>'judgeId',jsonb_array_length(analysis->'comparisons'),auth.uid(),(analysis->>'createdAt')::timestamptz,analysis);
    for comparison in select value from jsonb_array_elements(analysis->'comparisons') loop
      insert into public.judge_analysis_items(analysis_id,item_id,human_score,judge_score,agreement,snapshot)
      values(analysis->>'id',comparison->>'itemId',coalesce((comparison->>'humanNumericValue')::numeric,(comparison->>'humanLabelId')::numeric),
        (comparison->>'judgeScore')::numeric,(comparison->>'exactAgreement')::boolean,comparison);
    end loop;
  end loop;

  for report in select value from jsonb_array_elements(coalesce(bundle->'judgeAnalysisReports','[]'::jsonb)) loop
    if report->>'projectId' <> project_id then raise exception 'Report project mismatch'; end if;
    if not exists(select 1 from public.judge_analyses a where a.id=report->>'analysisId' and a.analysis_sha256=report->>'analysisHash')
      then raise exception 'Report does not reference the imported analysis hash'; end if;
    insert into public.judge_analysis_reports(id,project_id,analysis_id,finalization_id,schema_version,methodology_version,analysis_sha256,finalization_sha256,
      report_sha256,item_count,created_by,created_at,report)
    values(report->>'id',project_id,report->>'analysisId',report->>'finalizationId',report->>'schemaVersion',report#>>'{methodology,version}',report->>'analysisHash',
      report->>'finalizationHash',report->>'reportHash',(report#>>'{metrics,n}')::integer,auth.uid(),(report->>'createdAt')::timestamptz,report);
  end loop;

  for audit in select value from jsonb_array_elements(coalesce(bundle->'auditEvents','[]'::jsonb)) loop
    insert into public.audit_events(id,project_id,event_type,actor_id,metadata,created_at)
    values(audit->>'id',project_id,audit->>'type',auth.uid(),coalesce(audit->'metadata','{}'::jsonb),(audit->>'createdAt')::timestamptz);
  end loop;
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),project_id,'project_migrated_to_cloud',auth.uid(),jsonb_build_object('migratedFromLocalProjectId',project_id,'immutableArtifactsPreserved',true));
  return project_id;
end $$;

revoke all on function public.create_cloud_project_archive_copy(uuid,jsonb) from public;
grant execute on function public.create_cloud_project_archive_copy(uuid,jsonb) to authenticated;

