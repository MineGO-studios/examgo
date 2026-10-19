begin;

-- Separate, immutable metadata; historical single-idea/capture functions stay intact.
create table private.preset_question_point_ideas (
  revision_id uuid primary key references public.question_revisions(id) on delete restrict,
  mapping jsonb not null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  reviewer_name text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index preset_question_point_ideas_reviewer_idx on private.preset_question_point_ideas(reviewer_id);
alter table private.preset_question_point_ideas enable row level security;
revoke all on private.preset_question_point_ideas from public,anon,authenticated;
create trigger preset_question_point_ideas_immutable before update or delete on private.preset_question_point_ideas
  for each row execute function private.preset_history_immutable();

create function private.preset_revision_point_ids(p_revision_id uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; ids text[];
begin
  select * into v from public.question_revisions where id=p_revision_id;
  if not found or v.unit not between 1 and 4 then return null; end if;
  if v.question_type='matching' and jsonb_typeof(v.content->'left')='array' then
    select array_agg(v.question_id::text||':pair:'||(x->>'id') order by ord) into ids
      from jsonb_array_elements(v.content->'left') with ordinality points(x,ord);
    if exists(select 1 from jsonb_array_elements(v.content->'left') x
      where jsonb_typeof(x->'id') is distinct from 'string' or btrim(x->>'id')='') then return null; end if;
  elsif v.question_type='completion' and jsonb_typeof(v.content->'blankIds')='array' then
    select array_agg(v.question_id::text||':blank:'||(x#>>'{}') order by ord) into ids
      from jsonb_array_elements(v.content->'blankIds') with ordinality points(x,ord);
    if exists(select 1 from jsonb_array_elements(v.content->'blankIds') x
      where jsonb_typeof(x) is distinct from 'string' or btrim(x#>>'{}')='') then return null; end if;
  else return null; end if;
  if coalesce(cardinality(ids),0) not between 2 and 200 or
    (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then return null; end if;
  return ids;
end;
$$;

create function private.validate_preset_point_ideas(p_revision_id uuid,p_mapping jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare ids text[]:=private.preset_revision_point_ids(p_revision_id); point jsonb; position integer:=0;
begin
  if ids is null or jsonb_typeof(p_mapping) is distinct from 'object' or octet_length(p_mapping::text)>100000 then
    raise exception 'Bounded matching or multi-blank review in initial Units 1-4 required.' using errcode='23514'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_mapping) key) is distinct from
      array['points','revisionId','schemaVersion']::text[] or
    p_mapping->'schemaVersion' is distinct from '1'::jsonb or
    p_mapping->>'revisionId' is distinct from p_revision_id::text or
    jsonb_typeof(p_mapping->'points') is distinct from 'array' then
    raise exception 'Exact revision and point-review fields required.' using errcode='23514'; end if;
  if jsonb_array_length(p_mapping->'points')<>cardinality(ids) then
    raise exception 'Review every source point without adding or removing a point.' using errcode='23514'; end if;
  for point in select x from jsonb_array_elements(p_mapping->'points') x loop
    position:=position+1;
    if jsonb_typeof(point) is distinct from 'object' then
      raise exception 'Point review must be an object.' using errcode='23514'; end if;
    if (select array_agg(key order by key) from jsonb_object_keys(point) key) is distinct from
        array['ideaKeys','pointId']::text[] or point->>'pointId' is distinct from ids[position] or
      jsonb_typeof(point->'ideaKeys') is distinct from 'array' then
      raise exception 'Preserve source point order with reviewed idea keys.' using errcode='23514'; end if;
    if jsonb_array_length(point->'ideaKeys') not between 1 and 20 or
      exists(select 1 from jsonb_array_elements(point->'ideaKeys') x where jsonb_typeof(x) is distinct from 'string' or
        (x#>>'{}') !~ '^[a-z0-9][a-z0-9._-]{0,119}$') or
      (select count(distinct x) from jsonb_array_elements(point->'ideaKeys') x)<>jsonb_array_length(point->'ideaKeys') then
      raise exception 'Every point requires distinct bounded meaning keys.' using errcode='23514'; end if;
  end loop;
end;
$$;

revoke all on function private.preset_revision_point_ids(uuid),private.validate_preset_point_ideas(uuid,jsonb)
  from public,anon,authenticated;

create function private.assign_preset_question_point_ideas(p_entries jsonb,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); reviewer text:=private.preset_reviewer_name(); item jsonb;
  target_revision uuid; existing private.preset_question_point_ideas%rowtype; n integer:=0;
begin
  if actor is null or reviewer is null then raise exception 'Reviewer authority required.' using errcode='42501'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or octet_length(p_entries::text)>100000 or
    p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A bounded point review and reason are required.' using errcode='23514'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 or
    (select count(distinct x->>'revisionId') from jsonb_array_elements(p_entries) x)<>jsonb_array_length(p_entries) then
    raise exception 'Use one to 100 distinct exact revisions.' using errcode='23514'; end if;
  for item in select x from jsonb_array_elements(p_entries) x order by x->>'revisionId' loop
    target_revision:=(item->>'revisionId')::uuid;
    perform 1 from public.question_revisions v join public.questions q on q.id=v.question_id
      where v.id=target_revision and v.owner_id=actor and q.current_revision=v.revision for share of q;
    if not found then raise exception 'Current owned source revision required.' using errcode='42501'; end if;
    perform private.validate_preset_point_ideas(target_revision,item);
    -- Same revision lock domain as historical single-idea assignment; no unlocked first insert.
    perform pg_advisory_xact_lock(hashtextextended(target_revision::text,411));
    select * into existing from private.preset_question_point_ideas p where p.revision_id=target_revision;
    if found then
      if existing.mapping<>item then
        raise exception 'Correct point meanings on a new source revision.' using errcode='23505'; end if;
    else
      insert into private.preset_question_point_ideas(revision_id,mapping,reviewer_id,reviewer_name,reason)
        values(target_revision,item,actor,reviewer,p_reason);
      n:=n+1;
    end if;
  end loop;
  return n;
end;
$$;
create function public.assign_preset_question_point_ideas(p_entries jsonb,p_reason text)
returns integer language sql security invoker set search_path='' as $$
  select private.assign_preset_question_point_ideas(p_entries,p_reason);
$$;
revoke all on function private.assign_preset_question_point_ideas(jsonb,text),public.assign_preset_question_point_ideas(jsonb,text)
  from public,anon,authenticated;
grant execute on function private.assign_preset_question_point_ideas(jsonb,text),public.assign_preset_question_point_ideas(jsonb,text)
  to authenticated;

-- New compound path only. Do not change the historical capture/selection contract.
create function private.preset_point_selection_keys(p_revision_id uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; mapping jsonb; ideas text[]; families text[]; keys text[];
begin
  select * into v from public.question_revisions where id=p_revision_id;
  if not found or private.preset_revision_point_ids(p_revision_id) is null then return null; end if;
  select p.mapping into mapping from private.preset_question_point_ideas p where p.revision_id=p_revision_id;
  if mapping is null then return null; end if;
  select array_agg('idea:'||(idea#>>'{}') order by point_order,idea_order) into ideas
    from jsonb_array_elements(mapping->'points') with ordinality points(point,point_order),
      jsonb_array_elements(point->'ideaKeys') with ordinality meanings(idea,idea_order);
  if (select count(distinct key) from unnest(ideas) key)<>cardinality(ideas) then return null; end if;
  select array_agg(distinct 'family:'||md5(i.source_namespace||':'||(r.source_fields->>'family_id')) order by
    'family:'||md5(i.source_namespace||':'||(r.source_fields->>'family_id'))) into families
    from public.catalogue_import_rows r join public.catalogue_imports i on i.id=r.import_id
    where i.owner_id=v.owner_id and i.source_bank_id=v.bank_id and r.catalogue_id=v.external_id
      and nullif(r.source_fields->>'family_id','') is not null;
  keys:=ideas||array['wording:'||md5(lower(regexp_replace(btrim(v.prompt),'\s+',' ','g')))]||coalesce(families,array[]::text[]);
  if cardinality(keys)>20 then return null; end if;
  return keys;
end;
$$;
revoke all on function private.preset_point_selection_keys(uuid) from public,anon,authenticated;

commit;
