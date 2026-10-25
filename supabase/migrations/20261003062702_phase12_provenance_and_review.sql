begin;

-- Authority is provisioned by the database operator after an explicit owner nomination.
-- No JWT user_metadata, bank name, import flag or membership can assign this role.
create table private.preset_reviewers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table private.preset_reviewers enable row level security;
revoke all on private.preset_reviewers from public, anon, authenticated;

create table public.preset_curation (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  bank_id uuid not null,
  question_revision_id uuid references public.question_revisions(id) on delete restrict,
  version integer not null default 1 check (version >= 1),
  state text not null default 'draft' check (state in ('draft','in-review','approved','superseded','withdrawn')),
  provenance jsonb not null,
  private_source_notes text not null default '' check (char_length(private_source_notes) <= 10000),
  reviewer_id uuid references private.preset_reviewers(user_id) on delete restrict,
  reviewer_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bank_id,owner_id) references public.question_banks(id,owner_id) on delete restrict,
  check ((approved_at is null and reviewer_id is null and reviewer_name is null) or
    (approved_at is not null and reviewer_id is not null and reviewer_name is not null))
);
create unique index preset_curation_bank_key on public.preset_curation(bank_id) where question_revision_id is null;
create unique index preset_curation_revision_key on public.preset_curation(question_revision_id) where question_revision_id is not null;
create index preset_curation_owner_bank_idx on public.preset_curation(owner_id,bank_id);
create index preset_curation_reviewer_idx on public.preset_curation(reviewer_id);

create table public.preset_curation_history (
  curation_id uuid not null references public.preset_curation(id) on delete restrict,
  version integer not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_name text not null,
  state text not null,
  provenance jsonb not null,
  private_source_notes text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key (curation_id,version)
);
create index preset_curation_history_actor_idx on public.preset_curation_history(actor_id);
alter table public.preset_curation enable row level security;
alter table public.preset_curation_history enable row level security;
-- Reads use a projection RPC, so private source notes never enter ordinary teacher details.
revoke all on public.preset_curation, public.preset_curation_history from public, anon, authenticated;

create function private.preset_reviewer_name()
returns text language sql stable security definer set search_path = '' as $$
  select display_name from private.preset_reviewers where user_id = (select auth.uid());
$$;

create function private.validate_preset_provenance(p jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare k text; cap integer;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 30000 then
    raise exception 'Invalid provenance object.' using errcode='23514'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p) key) is distinct from
    array['answerEvidence','author','corpusScope','curriculumVersion','ministerialOccurrences','missingEvidence',
      'rightsEvidence','rightsStatus','schemaVersion','sourceEvidence','sourceKind','sourceReference']::text[]
    or p->'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'Unsupported provenance schema or fields.' using errcode='23514'; end if;
  for k,cap in select * from (values ('curriculumVersion',200),('author',200),('sourceReference',500),
    ('answerEvidence',2000),('rightsEvidence',2000),('corpusScope',2000)) limits loop
    if jsonb_typeof(p->k) is distinct from 'string' or char_length(p->>k) > cap then
      raise exception 'Invalid provenance text: %.',k using errcode='23514'; end if;
  end loop;
  if coalesce(p->>'sourceKind' not in ('ministerial-paper','teacher-authored','unknown'),true) or
    coalesce(p->>'sourceEvidence' not in ('verified','unverified','missing'),true) or
    coalesce(p->>'rightsStatus' not in ('unknown','permitted','restricted'),true) then
    raise exception 'Invalid source or rights status.' using errcode='23514'; end if;
  if p->'ministerialOccurrences' is distinct from 'null'::jsonb then
    if jsonb_typeof(p->'ministerialOccurrences') is distinct from 'number' or
      p->>'ministerialOccurrences' !~ '^[0-9]+$' or (p->>'ministerialOccurrences')::numeric > 100000 or
      btrim(p->>'corpusScope') = '' then raise exception 'Counts require an assessed corpus.' using errcode='23514'; end if;
  end if;
  if jsonb_typeof(p->'missingEvidence') is distinct from 'array' then
    raise exception 'Missing evidence must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p->'missingEvidence') > 20 or exists (select 1 from jsonb_array_elements(p->'missingEvidence') x
    where jsonb_typeof(x) <> 'string' or char_length(x#>>'{}') > 500 or btrim(x#>>'{}') = '') then
    raise exception 'Invalid missing evidence list.' using errcode='23514'; end if;
end;
$$;

create function private.save_preset_provenance(p_id uuid,p_bank_id uuid,p_revision_id uuid,p_expected_version integer,
  p_provenance jsonb,p_private_notes text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_name text := private.preset_reviewer_name(); r public.preset_curation%rowtype;
begin
  if actor is null or actor_name is null then raise exception 'Preset reviewer authority required.' using errcode='42501'; end if;
  if p_id is null or p_expected_version is null or p_private_notes is null or char_length(p_private_notes)>10000 or
    p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'Invalid provenance request.' using errcode='23514'; end if;
  perform private.validate_preset_provenance(p_provenance);
  perform 1 from public.question_banks where id=p_bank_id and owner_id=actor and not is_archived for share;
  if not found then raise exception 'Source bank is inaccessible.' using errcode='42501'; end if;
  if p_revision_id is not null then
    perform 1 from public.question_revisions v join public.questions q on q.id=v.question_id
      where v.id=p_revision_id and v.owner_id=actor and v.bank_id=p_bank_id and q.current_revision=v.revision for share of q;
    if not found then raise exception 'Current source revision required.' using errcode='42501'; end if;
  end if;
  -- Serialize an identity even before its initial row exists.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into r from public.preset_curation where id=p_id for update;
  if found then
    if r.owner_id<>actor or r.bank_id is distinct from p_bank_id or r.question_revision_id is distinct from p_revision_id then
      raise exception 'Curation identity is inaccessible.' using errcode='42501'; end if;
    if r.state<>'draft' then raise exception 'Only draft provenance can be edited; review a new revision for corrections.' using errcode='23514'; end if;
    if r.version<>p_expected_version then raise exception 'Stale curation version.' using errcode='40001'; end if;
    update public.preset_curation set provenance=p_provenance,private_source_notes=p_private_notes,
      version=version+1,updated_at=now() where id=p_id returning * into r;
  else
    if p_expected_version<>0 then raise exception 'Curation record is missing.' using errcode='40001'; end if;
    insert into public.preset_curation(id,owner_id,bank_id,question_revision_id,provenance,private_source_notes)
      values(p_id,actor,p_bank_id,p_revision_id,p_provenance,p_private_notes) returning * into r;
  end if;
  insert into public.preset_curation_history(curation_id,version,actor_id,actor_name,state,provenance,private_source_notes,reason)
    values(r.id,r.version,actor,actor_name,r.state,r.provenance,r.private_source_notes,p_reason);
  return r.id;
end;
$$;

create function private.transition_preset_curation(p_id uuid,p_expected_version integer,p_state text,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_name text := private.preset_reviewer_name(); r public.preset_curation%rowtype;
begin
  if actor is null or actor_name is null then raise exception 'Preset reviewer authority required.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A bounded decision reason is required.' using errcode='23514'; end if;
  select * into r from public.preset_curation where id=p_id for update;
  if not found then raise exception 'Curation record is inaccessible.' using errcode='42501'; end if;
  if r.version is distinct from p_expected_version then raise exception 'Stale curation version.' using errcode='40001'; end if;
  if not ((r.state='draft' and p_state in ('in-review','withdrawn')) or
    (r.state='in-review' and p_state in ('draft','approved','withdrawn')) or
    (r.state='approved' and p_state in ('superseded','withdrawn'))) then
    raise exception 'Invalid curation transition.' using errcode='23514'; end if;
  if p_state='approved' then
    perform private.validate_preset_provenance(r.provenance);
    if btrim(r.provenance->>'curriculumVersion')='' or btrim(r.provenance->>'author')='' or
      btrim(r.provenance->>'sourceReference')='' or r.provenance->>'sourceKind'='unknown' or
      (r.provenance->>'sourceKind'='ministerial-paper' and r.provenance->>'sourceEvidence'<>'verified') or
      btrim(r.provenance->>'answerEvidence')='' or r.provenance->>'rightsStatus'<>'permitted' or
      btrim(r.provenance->>'rightsEvidence')='' or jsonb_array_length(r.provenance->'missingEvidence')<>0 then
      raise exception 'Approval requires complete source, curriculum, answer and reuse evidence.' using errcode='23514'; end if;
    perform 1 from public.question_banks where id=r.bank_id and not is_archived for share;
    if not found then raise exception 'Archived bank cannot be approved.' using errcode='23514'; end if;
    if r.question_revision_id is not null then
      perform 1 from public.question_revisions v join public.questions q on q.id=v.question_id
        where v.id=r.question_revision_id and v.revision=q.current_revision and q.is_active for share of q;
      if not found then raise exception 'Current active source revision required.' using errcode='23514'; end if;
    end if;
  end if;
  update public.preset_curation set state=p_state,version=version+1,updated_at=now(),
    reviewer_id=case when p_state='approved' then actor else reviewer_id end,
    reviewer_name=case when p_state='approved' then actor_name else reviewer_name end,
    approved_at=case when p_state='approved' then now() else approved_at end where id=p_id returning * into r;
  insert into public.preset_curation_history(curation_id,version,actor_id,actor_name,state,provenance,private_source_notes,reason)
    values(r.id,r.version,actor,actor_name,r.state,r.provenance,r.private_source_notes,p_reason);
  return r.version;
end;
$$;

create function private.get_preset_curation(p_bank_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reviewer text := private.preset_reviewer_name(); records jsonb; targets jsonb;
begin
  if actor is null or not exists(select 1 from public.question_banks where id=p_bank_id and owner_id=actor) then
    raise exception 'Bank is inaccessible.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'bankId',r.bank_id,'revisionId',r.question_revision_id,
    'version',r.version,'state',r.state,'provenance',r.provenance,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,
    'privateNotes',case when reviewer is not null then r.private_source_notes else null end,
    'unit',v.unit,'lesson',v.lesson,'prompt',v.prompt,'currentRevision',q.current_revision,'sourceRevision',v.revision,
    'published',false,'history',(select coalesce(jsonb_agg(jsonb_build_object('version',h.version,'state',h.state,
      'actor',h.actor_name,'reason',h.reason,'provenance',h.provenance,
      'privateNotes',case when reviewer is not null then h.private_source_notes else null end,
      'createdAt',h.created_at) order by h.version),'[]'::jsonb)
      from public.preset_curation_history h where h.curation_id=r.id)) order by r.created_at,r.id),'[]'::jsonb)
    into records from public.preset_curation r left join public.question_revisions v on v.id=r.question_revision_id
    left join public.questions q on q.id=v.question_id where r.bank_id=p_bank_id or
      (r.owner_id=actor and exists(select 1 from public.question_bank_memberships m
        where m.bank_id=p_bank_id and m.question_id=v.question_id));
  select coalesce(jsonb_agg(jsonb_build_object('revisionId',v.id,'bankId',v.bank_id,'externalId',v.external_id,
    'questionId',v.question_id,'revision',v.revision,'unit',v.unit,'lesson',v.lesson,'prompt',v.prompt,
    'content',v.content,'answer',v.answer) order by v.external_id),'[]'::jsonb) into targets
    from public.question_bank_memberships m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.bank_id=p_bank_id and q.owner_id=actor and q.is_active;
  return jsonb_build_object('reviewer',reviewer,'records',records,'targets',targets);
end;
$$;

create function private.preset_history_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Preset audit history is immutable.' using errcode='23514'; end;
$$;
create trigger preset_history_immutable before update or delete on public.preset_curation_history
  for each row execute function private.preset_history_immutable();

-- Match the repository's existing invoker wrapper/private definer pattern.
create function public.save_preset_provenance(p_id uuid,p_bank_id uuid,p_revision_id uuid,p_expected_version integer,
  p_provenance jsonb,p_private_notes text,p_reason text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.save_preset_provenance(p_id,p_bank_id,p_revision_id,p_expected_version,p_provenance,p_private_notes,p_reason);
$$;
create function public.transition_preset_curation(p_id uuid,p_expected_version integer,p_state text,p_reason text)
returns integer language sql security invoker set search_path = '' as $$
  select private.transition_preset_curation(p_id,p_expected_version,p_state,p_reason);
$$;
create function public.get_preset_curation(p_bank_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select private.get_preset_curation(p_bank_id); $$;

revoke all on function private.preset_reviewer_name(),private.validate_preset_provenance(jsonb),private.preset_history_immutable()
  from public,anon,authenticated;
revoke all on function private.save_preset_provenance(uuid,uuid,uuid,integer,jsonb,text,text),
  private.transition_preset_curation(uuid,integer,text,text),private.get_preset_curation(uuid),
  public.save_preset_provenance(uuid,uuid,uuid,integer,jsonb,text,text),
  public.transition_preset_curation(uuid,integer,text,text),public.get_preset_curation(uuid) from public,anon,authenticated;
grant execute on function private.save_preset_provenance(uuid,uuid,uuid,integer,jsonb,text,text),
  private.transition_preset_curation(uuid,integer,text,text),private.get_preset_curation(uuid),
  public.save_preset_provenance(uuid,uuid,uuid,integer,jsonb,text,text),
  public.transition_preset_curation(uuid,integer,text,text),public.get_preset_curation(uuid) to authenticated;

-- This slice records trust and review only. Approval does not expose sources or
-- make them selectable. Governed publication and teacher snapshot use remain a separate gate.
commit;
