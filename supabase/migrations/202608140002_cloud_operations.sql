create function public.create_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(workspace_name)) = 0 then raise exception 'Workspace name is required'; end if;
  insert into public.workspaces(id, name, created_by) values (new_id, trim(workspace_name), auth.uid());
  insert into public.workspace_members(workspace_id, user_id, role, accepted_at)
    values (new_id, auth.uid(), 'OWNER', now());
  return new_id;
end $$;

create function public.add_existing_workspace_member(target_workspace_id uuid, member_email text, member_role public.workspace_role)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid;
begin
  if private.workspace_role_for(target_workspace_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  if member_role = 'OWNER' then raise exception 'Owner invitations are not supported in this milestone'; end if;
  select u.id into target_user_id from auth.users u where lower(u.email) = lower(trim(member_email));
  if target_user_id is null then raise exception 'That email must first accept a Supabase Auth invitation'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, invited_at, accepted_at)
    values (target_workspace_id, target_user_id, member_role, now(), now())
    on conflict (workspace_id, user_id) do update set role = excluded.role, accepted_at = now();
  return target_user_id;
end $$;

create function public.delete_cloud_project(target_project_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.project_role(target_project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  delete from public.projects where id = target_project_id;
end $$;

create function private.annotation_state_token(target_project_id text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(digest(coalesce(string_agg(a.id::text || ':' || a.revision::text || ':' || a.status, '|' order by a.id), ''), 'sha256'), 'hex')
  from public.annotations a where a.project_id = target_project_id
$$;

create function public.get_annotation_state_token(target_project_id text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.project_role(target_project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  return private.annotation_state_token(target_project_id);
end $$;

create function public.finalize_human_validation(target_project_id text, expected_state_token text, artifact jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare finalization_id text := artifact->>'id'; item jsonb; expected_items integer; submitted_items integer;
begin
  if private.project_role(target_project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  perform 1 from public.projects p where p.id = target_project_id and p.status = 'HUMAN_COMPLETE' for update;
  if not found then raise exception 'Project must be HUMAN_COMPLETE'; end if;
  if private.annotation_state_token(target_project_id) <> expected_state_token then raise exception 'Stale annotation state'; end if;
  select count(*) into expected_items from public.validation_items where project_id = target_project_id;
  select count(distinct a.item_id) into submitted_items from public.annotations a where a.project_id = target_project_id and a.status = 'submitted';
  if expected_items = 0 or submitted_items <> expected_items then raise exception 'Every item requires a submitted annotation'; end if;
  if jsonb_array_length(artifact->'annotations') <> expected_items then raise exception 'Finalization item count mismatch'; end if;
  for item in select value from jsonb_array_elements(artifact->'annotations') loop
    if not exists(select 1 from public.annotations a where a.id = item->>'annotationId' and a.project_id = target_project_id and a.status = 'submitted' and a.revision = (item->>'annotationRevision')::integer)
      then raise exception 'Finalization contains a stale annotation revision'; end if;
  end loop;
  insert into public.human_validation_finalizations(id, project_id, finalization_sequence, schema_version, snapshot_sha256, source_sha256,
    benchmark_pack_id, benchmark_pack_version, rubric_version, item_count, finalized_by, finalized_at, snapshot)
  values (finalization_id, target_project_id, coalesce((artifact->>'finalizationSequence')::integer, 1), artifact->>'schemaVersion', artifact->>'snapshotHash',
    artifact#>>'{source,fileSha256}', artifact#>>'{benchmark,benchmarkId}', artifact#>>'{benchmark,benchmarkPackVersion}', artifact#>>'{benchmark,rubricVersion}', expected_items,
    auth.uid(), (artifact->>'finalizedAt')::timestamptz, artifact);
  for item in select value from jsonb_array_elements(artifact->'annotations') loop
    insert into public.human_finalization_items(finalization_id, item_id, annotation_id, annotation_revision, human_score, snapshot)
    values(finalization_id, item->>'itemId', item->>'annotationId', (item->>'annotationRevision')::integer, coalesce((item->>'numericValue')::numeric,(item->>'labelId')::numeric), item);
  end loop;
  insert into public.audit_events(id, project_id, event_type, actor_id, metadata)
    values(gen_random_uuid(), target_project_id, 'human_validation_finalized', auth.uid(), jsonb_build_object('finalizationId',finalization_id,'snapshotHash',artifact->>'snapshotHash','itemCount',expected_items));
  update public.projects set status = 'HUMAN_FINALIZED', updated_at = now() where id = target_project_id;
  return finalization_id;
end $$;

create function public.create_judge_analysis(target_finalization_id text, artifact jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare project_id text; recorded_hash text; analysis_id text := artifact->>'id'; item jsonb;
begin
  select f.project_id, f.snapshot_sha256 into project_id, recorded_hash from public.human_validation_finalizations f where f.id = target_finalization_id for share;
  if private.project_role(project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  perform 1 from public.projects p where p.id = project_id and p.status = 'HUMAN_FINALIZED' for update;
  if not found then raise exception 'Project must be HUMAN_FINALIZED'; end if;
  if artifact->>'finalizationHash' <> recorded_hash then raise exception 'Finalization hash mismatch'; end if;
  if artifact->>'finalizationId' <> target_finalization_id then raise exception 'Finalization ID mismatch'; end if;
  for item in select value from jsonb_array_elements(artifact->'judgeArtifacts') loop
    if not exists(select 1 from public.judge_artifacts j where j.id = item->>'id' and j.item_id = item->>'itemId' and j.artifact_sha256 = item->>'artifactHash')
      then raise exception 'Judge artifact set is stale or invalid'; end if;
  end loop;
  insert into public.judge_analyses(id, project_id, finalization_id, schema_version, finalization_sha256, judge_artifact_set_sha256,
    analysis_sha256, judge_id, item_count, created_by, created_at, snapshot)
  values(analysis_id, project_id, target_finalization_id, artifact->>'schemaVersion', recorded_hash, artifact->>'judgeArtifactSetHash',
    artifact->>'analysisHash', artifact->>'judgeId', jsonb_array_length(artifact->'comparisons'), auth.uid(), (artifact->>'createdAt')::timestamptz, artifact);
  for item in select value from jsonb_array_elements(artifact->'comparisons') loop
    insert into public.judge_analysis_items(analysis_id,item_id,human_score,judge_score,agreement,snapshot)
    values(analysis_id,item->>'itemId',coalesce((item->>'humanNumericValue')::numeric,(item->>'humanLabelId')::numeric),(item->>'judgeScore')::numeric,(item->>'exactAgreement')::boolean,item);
  end loop;
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),project_id,'judge_analysis_created',auth.uid(),jsonb_build_object('analysisId',analysis_id,'finalizationId',target_finalization_id,'analysisHash',artifact->>'analysisHash'));
  update public.projects set status='UNBLINDED',updated_at=now() where id=project_id;
  return analysis_id;
end $$;

create function public.create_judge_analysis_report(target_analysis_id text, artifact jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare project_id text; finalization_id text; recorded_hash text; report_id text := artifact->>'id';
begin
  select a.project_id,a.finalization_id,a.analysis_sha256 into project_id,finalization_id,recorded_hash from public.judge_analyses a where a.id=target_analysis_id for share;
  if private.project_role(project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  perform 1 from public.projects p where p.id=project_id and p.status='UNBLINDED' for share;
  if not found then raise exception 'Project must be UNBLINDED'; end if;
  if artifact->>'analysisHash' <> recorded_hash or artifact->>'analysisId' <> target_analysis_id then raise exception 'Analysis snapshot mismatch'; end if;
  insert into public.judge_analysis_reports(id,project_id,analysis_id,finalization_id,schema_version,methodology_version,
    analysis_sha256,finalization_sha256,report_sha256,item_count,created_by,created_at,report)
  values(report_id,project_id,target_analysis_id,finalization_id,artifact->>'schemaVersion',artifact#>>'{methodology,version}',recorded_hash,
    artifact->>'finalizationHash',artifact->>'reportHash',(artifact#>>'{metrics,n}')::integer,auth.uid(),(artifact->>'createdAt')::timestamptz,artifact);
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),project_id,'judge_analysis_report_created',auth.uid(),jsonb_build_object('reportId',report_id,'analysisId',target_analysis_id,'reportHash',artifact->>'reportHash'));
  return report_id;
end $$;

revoke all on function public.create_workspace(text) from public;
revoke all on function public.add_existing_workspace_member(uuid,text,public.workspace_role) from public;
revoke all on function public.delete_cloud_project(text) from public;
revoke all on function public.get_annotation_state_token(text) from public;
revoke all on function public.finalize_human_validation(text,text,jsonb) from public;
revoke all on function public.create_judge_analysis(text,jsonb) from public;
revoke all on function public.create_judge_analysis_report(text,jsonb) from public;
grant execute on function public.create_workspace(text), public.add_existing_workspace_member(uuid,text,public.workspace_role),
  public.delete_cloud_project(text), public.get_annotation_state_token(text), public.finalize_human_validation(text,text,jsonb),
  public.create_judge_analysis(text,jsonb), public.create_judge_analysis_report(text,jsonb) to authenticated;

create view public.cloud_project_summaries with (security_invoker = true) as
select p.id,p.workspace_id,p.created_by,p.name,p.benchmark_pack_id,p.benchmark_pack_version,p.status,p.source_name,p.source_sha256,
  p.migrated_from_local_project_id,p.created_at,p.updated_at,
  count(distinct i.id)::integer as total,
  count(distinct i.id) filter (where a.id is null)::integer as unseen,
  count(distinct i.id) filter (where a.status='draft')::integer as drafts,
  count(distinct i.id) filter (where a.status='submitted')::integer as submitted,
  count(distinct i.id) filter (where coalesce((a.answers->>'needs-review')::boolean,false))::integer as flagged,
  count(distinct i.id) filter (where lower(a.answers->>'confidence')='low')::integer as low_confidence,
  0::integer as skipped,
  case when count(distinct i.id)=0 then 0 else round(100.0*count(distinct i.id) filter (where a.status='submitted')/count(distinct i.id))::integer end as percent_complete,
  greatest(p.updated_at,coalesce(max(a.updated_at),p.updated_at)) as last_activity_at
from public.projects p left join public.validation_items i on i.project_id=p.id left join public.annotations a on a.item_id=i.id
group by p.id;
grant select on public.cloud_project_summaries to authenticated;
