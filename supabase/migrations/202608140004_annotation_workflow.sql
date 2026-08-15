create function public.set_cloud_project_workflow_status(target_project_id text, next_status public.project_status) returns void
language plpgsql security definer set search_path = '' as $$
declare current_status public.project_status;
begin
  if private.project_role(target_project_id) not in ('OWNER','VALIDATOR') then raise exception 'Annotation access required'; end if;
  if private.project_role(target_project_id)='VALIDATOR' and not private.validator_assigned(target_project_id) then raise exception 'Project assignment required'; end if;
  select status into current_status from public.projects where id=target_project_id for update;
  if current_status in ('HUMAN_FINALIZED','UNBLINDED') then raise exception 'Human annotations are locked'; end if;
  if next_status not in ('VALIDATING','REVIEW','HUMAN_COMPLETE') then raise exception 'Invalid workflow transition'; end if;
  update public.projects set status=next_status,updated_at=now() where id=target_project_id;
end $$;

create function public.save_cloud_annotation(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare target_project_id text := payload->>'projectId'; existing_revision integer; actor_role public.workspace_role;
begin
  actor_role := private.project_role(target_project_id);
  if actor_role not in ('OWNER','VALIDATOR') then raise exception 'Annotation access required'; end if;
  if actor_role='VALIDATOR' and not private.validator_assigned(target_project_id) then raise exception 'Project assignment required'; end if;
  perform 1 from public.projects p where p.id=target_project_id and p.status not in ('HUMAN_FINALIZED','UNBLINDED') for share;
  if not found then raise exception 'Human annotations are locked'; end if;
  if not exists(select 1 from public.validation_items i where i.id=payload->>'itemId' and i.project_id=target_project_id) then raise exception 'Item does not belong to project'; end if;
  select revision into existing_revision from public.annotations where item_id=payload->>'itemId' and validator_id=auth.uid() for update;
  if existing_revision is not null and (payload->>'revision')::integer <= existing_revision then raise exception 'Stale annotation revision'; end if;
  insert into public.annotations(id,item_id,project_id,validator_id,benchmark_pack_id,benchmark_pack_version,rubric_version,status,answers,notes,evidence_spans,revision,created_at,updated_at,submitted_at)
  values(payload->>'id',payload->>'itemId',target_project_id,auth.uid(),payload->>'benchmarkPackId',payload->>'benchmarkPackVersion',payload->>'rubricVersion',payload->>'status',
    coalesce(payload->'answers','{}'::jsonb),payload->>'notes',coalesce(payload->'evidenceSpans','[]'::jsonb),(payload->>'revision')::integer,
    (payload->>'createdAt')::timestamptz,(payload->>'updatedAt')::timestamptz,nullif(payload->>'submittedAt','')::timestamptz)
  on conflict(item_id,validator_id) do update set status=excluded.status,answers=excluded.answers,notes=excluded.notes,evidence_spans=excluded.evidence_spans,
    revision=excluded.revision,updated_at=excluded.updated_at,submitted_at=excluded.submitted_at;
  insert into public.audit_events(id,project_id,event_type,actor_id,metadata)
    values(gen_random_uuid(),target_project_id,case when payload->>'status'='submitted' then 'annotation_submitted' else 'annotation_saved' end,auth.uid(),
      jsonb_build_object('itemId',payload->>'itemId','annotationId',payload->>'id','revision',(payload->>'revision')::integer));
  update public.projects set status=case
    when (select count(*) from public.validation_items where project_id=target_project_id) =
         (select count(distinct item_id) from public.annotations where project_id=target_project_id and status='submitted') then 'HUMAN_COMPLETE'::public.project_status
    else 'VALIDATING'::public.project_status end, updated_at=now() where id=target_project_id;
end $$;

revoke all on function public.set_cloud_project_workflow_status(text,public.project_status), public.save_cloud_annotation(jsonb) from public;
grant execute on function public.set_cloud_project_workflow_status(text,public.project_status), public.save_cloud_annotation(jsonb) to authenticated;

