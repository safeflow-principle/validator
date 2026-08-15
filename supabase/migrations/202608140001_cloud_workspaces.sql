-- SafeFlow cloud research workspaces. Run through the Supabase migration system.
-- No frontend secret is required; every browser request is constrained by RLS.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.workspace_role as enum ('OWNER', 'RESEARCHER', 'VALIDATOR');
create type public.project_status as enum ('READY', 'VALIDATING', 'REVIEW', 'HUMAN_COMPLETE', 'HUMAN_FINALIZED', 'UNBLINDED');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null, invited_at timestamptz not null default now(), accepted_at timestamptz,
  primary key (workspace_id, user_id)
);
create table public.projects (
  id text primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id), name text not null,
  benchmark_pack_id text not null, benchmark_pack_version text not null,
  status public.project_status not null default 'READY', source_name text, source_sha256 text,
  source_storage_path text, migrated_from_local_project_id text,
  created_at timestamptz not null, updated_at timestamptz not null,
  check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$')
);
create table public.project_assignments (
  project_id text not null references public.projects(id) on delete cascade,
  validator_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(), primary key (project_id, validator_id)
);
create table public.validation_items (
  id text primary key, project_id text not null references public.projects(id) on delete cascade,
  external_id text, prompt text not null, response text not null, category_id text,
  metadata jsonb not null default '{}'::jsonb, source_order integer not null, created_at timestamptz not null,
  unique (project_id, external_id), unique (project_id, source_order)
);
create table public.annotations (
  id text primary key, item_id text not null references public.validation_items(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  validator_id uuid not null references auth.users(id), benchmark_pack_id text not null,
  benchmark_pack_version text not null, rubric_version text not null,
  status text not null check (status in ('draft','submitted')), answers jsonb not null default '{}'::jsonb,
  notes text, evidence_spans jsonb not null default '[]'::jsonb, revision integer not null check (revision >= 0),
  created_at timestamptz not null, updated_at timestamptz not null, submitted_at timestamptz,
  unique (item_id, validator_id)
);
create table public.reference_artifacts (
  id text primary key, item_id text not null unique references public.validation_items(id) on delete cascade,
  label jsonb not null, provenance text, created_at timestamptz not null
);
create table public.judge_artifacts (
  id text primary key, item_id text not null references public.validation_items(id) on delete cascade,
  judge_id text not null, score jsonb not null, reasoning text, metadata jsonb not null default '{}'::jsonb,
  artifact_sha256 text not null, created_at timestamptz not null, unique (item_id, judge_id)
);
create table public.human_validation_finalizations (
  id text primary key, project_id text not null references public.projects(id) on delete cascade,
  finalization_sequence integer not null, schema_version text not null, snapshot_sha256 text not null,
  source_sha256 text, benchmark_pack_id text not null, benchmark_pack_version text not null,
  rubric_version text not null, item_count integer not null, finalized_by uuid not null references auth.users(id),
  finalized_at timestamptz not null, snapshot jsonb not null, unique(project_id, finalization_sequence)
);
create table public.human_finalization_items (
  finalization_id text not null references public.human_validation_finalizations(id) on delete cascade,
  item_id text not null references public.validation_items(id), annotation_id text not null,
  annotation_revision integer not null, human_score numeric not null, snapshot jsonb not null,
  primary key (finalization_id, item_id)
);
create table public.judge_analyses (
  id text primary key, project_id text not null references public.projects(id) on delete cascade,
  finalization_id text not null unique references public.human_validation_finalizations(id),
  schema_version text not null, finalization_sha256 text not null, judge_artifact_set_sha256 text not null,
  analysis_sha256 text not null, judge_id text not null, item_count integer not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null, snapshot jsonb not null
);
create table public.judge_analysis_items (
  analysis_id text not null references public.judge_analyses(id) on delete cascade,
  item_id text not null references public.validation_items(id), human_score numeric not null,
  judge_score numeric not null, agreement boolean not null, snapshot jsonb not null,
  primary key (analysis_id, item_id)
);
create table public.judge_analysis_reports (
  id text primary key, project_id text not null references public.projects(id) on delete cascade,
  analysis_id text not null references public.judge_analyses(id), finalization_id text not null references public.human_validation_finalizations(id),
  schema_version text not null, methodology_version text not null, analysis_sha256 text not null,
  finalization_sha256 text not null, report_sha256 text not null, item_count integer not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null, report jsonb not null,
  unique (analysis_id, methodology_version)
);
create table public.audit_events (
  id text primary key, project_id text not null references public.projects(id) on delete cascade,
  event_type text not null, actor_id uuid not null references auth.users(id), metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (metadata ?| array['prompt','response','reasoning','evidenceSpans','evidence_spans']))
);

create index validation_items_project_idx on public.validation_items(project_id, source_order);
create index annotations_project_idx on public.annotations(project_id, validator_id, status);
create index judge_artifacts_item_idx on public.judge_artifacts(item_id);
create index finalizations_project_idx on public.human_validation_finalizations(project_id, finalization_sequence);
create index analyses_project_idx on public.judge_analyses(project_id);
create index reports_project_idx on public.judge_analysis_reports(project_id);
create index audit_project_idx on public.audit_events(project_id, created_at);

create function private.workspace_role_for(target_workspace_id uuid) returns public.workspace_role
language sql stable security definer set search_path = '' as $$
  select wm.role from public.workspace_members wm
  where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.accepted_at is not null
$$;
create function private.project_workspace(target_project_id text) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workspace_id from public.projects p where p.id = target_project_id
$$;
create function private.project_role(target_project_id text) returns public.workspace_role
language sql stable security definer set search_path = '' as $$
  select private.workspace_role_for(private.project_workspace(target_project_id))
$$;
create function private.validator_assigned(target_project_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.project_assignments pa where pa.project_id = target_project_id and pa.validator_id = auth.uid())
$$;
create function private.can_read_project(target_project_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.project_role(target_project_id) in ('OWNER','RESEARCHER')
    or (private.project_role(target_project_id) = 'VALIDATOR' and private.validator_assigned(target_project_id))
$$;
create function private.can_read_unblinded(target_project_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.project_role(target_project_id) in ('OWNER','RESEARCHER')
    and exists(select 1 from public.projects p where p.id = target_project_id and p.status = 'UNBLINDED')
$$;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.validation_items enable row level security;
alter table public.annotations enable row level security;
alter table public.reference_artifacts enable row level security;
alter table public.judge_artifacts enable row level security;
alter table public.human_validation_finalizations enable row level security;
alter table public.human_finalization_items enable row level security;
alter table public.judge_analyses enable row level security;
alter table public.judge_analysis_items enable row level security;
alter table public.judge_analysis_reports enable row level security;
alter table public.audit_events enable row level security;

create policy workspaces_read on public.workspaces for select to authenticated
  using (private.workspace_role_for(id) is not null);
create policy members_read_self_or_owner on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or private.workspace_role_for(workspace_id) = 'OWNER');
create policy members_owner_insert on public.workspace_members for insert to authenticated
  with check (private.workspace_role_for(workspace_id) = 'OWNER');
create policy members_owner_update on public.workspace_members for update to authenticated
  using (private.workspace_role_for(workspace_id) = 'OWNER') with check (private.workspace_role_for(workspace_id) = 'OWNER');
create policy members_owner_delete on public.workspace_members for delete to authenticated
  using (private.workspace_role_for(workspace_id) = 'OWNER' and user_id <> auth.uid());

create policy projects_read on public.projects for select to authenticated using (private.can_read_project(id));
create policy projects_owner_insert on public.projects for insert to authenticated
  with check (created_by = auth.uid() and private.workspace_role_for(workspace_id) = 'OWNER');
-- Project status transitions are intentionally not writable through generic table updates.
-- Security-definer RPCs below are the only path for finalization and unblinding.
create policy assignments_owner_all on public.project_assignments for all to authenticated
  using (private.project_role(project_id) = 'OWNER') with check (private.project_role(project_id) = 'OWNER');
create policy assignments_validator_read_self on public.project_assignments for select to authenticated
  using (validator_id = auth.uid());

create policy items_read on public.validation_items for select to authenticated using (private.can_read_project(project_id));
create policy items_owner_insert on public.validation_items for insert to authenticated
  with check (private.project_role(project_id) = 'OWNER');
create policy items_owner_update on public.validation_items for update to authenticated
  using (private.project_role(project_id) = 'OWNER') with check (private.project_role(project_id) = 'OWNER');

create policy annotations_read on public.annotations for select to authenticated
  using (private.project_role(project_id) = 'OWNER'
    or (private.project_role(project_id) = 'RESEARCHER' and exists(select 1 from public.projects p where p.id=project_id and p.status in ('HUMAN_FINALIZED','UNBLINDED')))
    or (validator_id = auth.uid() and private.project_role(project_id) = 'VALIDATOR' and private.validator_assigned(project_id)));
create policy annotations_write on public.annotations for insert to authenticated
  with check ((validator_id = auth.uid() and private.project_role(project_id) in ('OWNER','VALIDATOR')) and (private.project_role(project_id) <> 'VALIDATOR' or private.validator_assigned(project_id)));
create policy annotations_edit on public.annotations for update to authenticated
  using (validator_id = auth.uid() and private.project_role(project_id) in ('OWNER','VALIDATOR'))
  with check (validator_id = auth.uid() and private.project_role(project_id) in ('OWNER','VALIDATOR'));

-- Validator is intentionally absent from every policy below.
create policy references_owner_researcher on public.reference_artifacts for select to authenticated
  using (private.project_role((select vi.project_id from public.validation_items vi where vi.id = item_id)) in ('OWNER','RESEARCHER'));
create policy references_owner_insert on public.reference_artifacts for insert to authenticated
  with check (private.project_role((select vi.project_id from public.validation_items vi where vi.id = item_id)) = 'OWNER');
create policy judges_unblinded_read on public.judge_artifacts for select to authenticated
  using (private.can_read_unblinded((select vi.project_id from public.validation_items vi where vi.id = item_id)));
create policy judges_owner_insert on public.judge_artifacts for insert to authenticated
  with check (private.project_role((select vi.project_id from public.validation_items vi where vi.id = item_id)) = 'OWNER');
create policy finalizations_read on public.human_validation_finalizations for select to authenticated
  using (private.project_role(project_id) in ('OWNER','RESEARCHER'));
create policy finalization_items_read on public.human_finalization_items for select to authenticated
  using (private.project_role((select f.project_id from public.human_validation_finalizations f where f.id = finalization_id)) in ('OWNER','RESEARCHER'));
create policy analyses_unblinded_read on public.judge_analyses for select to authenticated using (private.can_read_unblinded(project_id));
create policy analysis_items_unblinded_read on public.judge_analysis_items for select to authenticated
  using (private.can_read_unblinded((select a.project_id from public.judge_analyses a where a.id = analysis_id)));
create policy reports_unblinded_read on public.judge_analysis_reports for select to authenticated using (private.can_read_unblinded(project_id));
create policy audit_owner_researcher_read on public.audit_events for select to authenticated using (private.project_role(project_id) in ('OWNER','RESEARCHER'));

-- Immutable tables are readable through RLS but have no client INSERT/UPDATE/DELETE policies.
revoke insert, update, delete on public.human_validation_finalizations, public.human_finalization_items,
  public.judge_analyses, public.judge_analysis_items, public.judge_analysis_reports, public.audit_events from authenticated;
