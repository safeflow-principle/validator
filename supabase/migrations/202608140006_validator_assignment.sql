-- Owner-controlled assignment keeps VALIDATOR membership narrower than RESEARCHER access.
create function public.assign_project_validator(target_project_id text, member_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid; target_workspace_id uuid;
begin
  if private.project_role(target_project_id) <> 'OWNER' then raise exception 'Owner access required'; end if;
  select p.workspace_id into target_workspace_id from public.projects p where p.id = target_project_id;
  select u.id into target_user_id
    from auth.users u
    join public.workspace_members wm on wm.user_id = u.id and wm.workspace_id = target_workspace_id
    where lower(u.email) = lower(trim(member_email)) and wm.role = 'VALIDATOR' and wm.accepted_at is not null;
  if target_user_id is null then raise exception 'That email must be an accepted VALIDATOR member of this workspace'; end if;
  insert into public.project_assignments(project_id, validator_id)
    values(target_project_id, target_user_id)
    on conflict (project_id, validator_id) do nothing;
  insert into public.audit_events(id, project_id, event_type, actor_id, metadata)
    values(gen_random_uuid(), target_project_id, 'validator_assigned', auth.uid(), jsonb_build_object('validatorId', target_user_id));
  return target_user_id;
end $$;

revoke all on function public.assign_project_validator(text,text) from public;
grant execute on function public.assign_project_validator(text,text) to authenticated;
