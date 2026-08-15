create function public.create_cloud_project_copy(target_workspace_id uuid, bundle jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare project jsonb := bundle->'project'; item jsonb; annotation jsonb; judge jsonb; reference jsonb; project_id text := project->>'id';
begin
  if private.workspace_role_for(target_workspace_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  if project->>'status' in ('HUMAN_FINALIZED','UNBLINDED') then
    raise exception 'Finalized local projects require immutable-artifact migration, which is not enabled yet';
  end if;
  insert into public.projects(id,workspace_id,created_by,name,benchmark_pack_id,benchmark_pack_version,status,source_name,source_sha256,migrated_from_local_project_id,created_at,updated_at)
  values(project_id,target_workspace_id,auth.uid(),project->>'name',project->>'benchmarkPackId',project->>'benchmarkPackVersion',(project->>'status')::public.project_status,
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
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),project_id,'project_created',auth.uid(),jsonb_build_object('workspaceMode','CLOUD','migratedFromLocalProjectId',project_id));
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),project_id,'dataset_imported',auth.uid(),jsonb_build_object('sourceName',bundle#>>'{importRun,sourceName}','sourceSha256',bundle#>>'{importRun,sourceSha256}','itemCount',jsonb_array_length(bundle->'items')));
  return project_id;
end $$;

revoke all on function public.create_cloud_project_copy(uuid,jsonb) from public;
grant execute on function public.create_cloud_project_copy(uuid,jsonb) to authenticated;

