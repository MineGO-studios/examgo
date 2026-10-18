begin;
-- Internal idea identity is separate from user-bank metadata and public provenance.
-- Assignments are immutable per revision. A correction requires a new revision.
create table private.preset_question_ideas (
  revision_id uuid primary key references public.question_revisions(id) on delete restrict,
  idea_key text not null check(idea_key ~ '^[a-z0-9][a-z0-9._-]{0,119}$'),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  reviewer_name text not null,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index preset_question_ideas_reviewer_idx on private.preset_question_ideas(reviewer_id);
alter table private.preset_question_ideas enable row level security;
revoke all on private.preset_question_ideas from public,anon,authenticated;
create trigger preset_question_ideas_immutable before update or delete on private.preset_question_ideas
  for each row execute function private.preset_history_immutable();

create function private.preset_question_idea(p_revision_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; assigned text; choices text[]; correct text;
begin
  select idea_key into assigned from private.preset_question_ideas where revision_id=p_revision_id;
  if assigned is not null then return assigned; end if;
  select * into v from public.question_revisions where id=p_revision_id;
  if not found then return null; end if;
  -- Bounded rules cover explicit age questions and the six previously published
  -- simple exercise members. Unknown concepts require one reviewed batch mapping.
  if v.question_type='multiple-choice' then
    select array_agg(lower(btrim(x->>'text')) order by lower(btrim(x->>'text'))) into choices
      from jsonb_array_elements(v.content->'options') x;
    select lower(btrim(x->>'text')) into correct from jsonb_array_elements(v.content->'options') x
      where x->>'label'=v.answer->>'correctOptionLabel';
    if correct='how old' and choices @> array['how old','how many'] then return 'asking-age'; end if;
    if choices=array['a','an'] then return 'indefinite-article'; end if;
    if choices=array['has','have'] then return 'present-have-agreement'; end if;
    if choices=array['it','she'] then return 'referent-pronoun'; end if;
    if choices=array['in','on'] and lower(v.prompt) ~ '(road|street)' then return 'road-preposition'; end if;
    if choices=array['start','starts'] then return 'present-verb-agreement'; end if;
  elsif v.question_type='short-answer' and lower(btrim(v.prompt)) ~ '^how old\M' then
    return 'asking-age';
  end if;
  return null;
end;
$$;

create function private.assign_preset_question_ideas(p_entries jsonb,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); name text:=private.preset_reviewer_name(); item jsonb;
  existing private.preset_question_ideas%rowtype; n integer:=0;
begin
  if actor is null or name is null then raise exception 'Reviewer authority required.' using errcode='42501'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or octet_length(p_entries::text)>100000 or
    p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A bounded idea mapping and reason are required.' using errcode='23514'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 or
    (select count(distinct x->>'revisionId') from jsonb_array_elements(p_entries) x)<>jsonb_array_length(p_entries) then
    raise exception 'Use one to 100 distinct revisions.' using errcode='23514'; end if;
  -- Stable ordering and shared source locks prevent assignment/source-correction races.
  for item in select x from jsonb_array_elements(p_entries) x order by x->>'revisionId' loop
    if jsonb_typeof(item) is distinct from 'object' or
      (select array_agg(key order by key) from jsonb_object_keys(item) key) is distinct from array['ideaKey','revisionId']::text[] or
      jsonb_typeof(item->'ideaKey') is distinct from 'string' or item->>'ideaKey' !~ '^[a-z0-9][a-z0-9._-]{0,119}$' then
      raise exception 'Unsupported idea mapping.' using errcode='23514'; end if;
    perform 1 from public.question_revisions v join public.questions q on q.id=v.question_id
      where v.id=(item->>'revisionId')::uuid and v.owner_id=actor and q.current_revision=v.revision for share of q;
    if not found then raise exception 'Current owned source revision required.' using errcode='42501'; end if;
    if exists(select 1 from public.preset_curation c join public.preset_publications p on p.curation_id=c.id
      where c.question_revision_id=(item->>'revisionId')::uuid) and
      private.preset_question_idea((item->>'revisionId')::uuid) is not null and
      private.preset_question_idea((item->>'revisionId')::uuid)<>item->>'ideaKey' then
      raise exception 'Correct a published idea on a new source revision.' using errcode='23505'; end if;
    perform pg_advisory_xact_lock(hashtextextended(item->>'revisionId',411));
    select * into existing from private.preset_question_ideas where revision_id=(item->>'revisionId')::uuid;
    if found then
      if existing.idea_key<>item->>'ideaKey' then raise exception 'Correct an idea on a new source revision.' using errcode='23505'; end if;
    else
      insert into private.preset_question_ideas(revision_id,idea_key,reviewer_id,reviewer_name,reason)
        values((item->>'revisionId')::uuid,item->>'ideaKey',actor,name,p_reason);
      n:=n+1;
    end if;
  end loop;
  return n;
end;
$$;
create function public.assign_preset_question_ideas(p_entries jsonb,p_reason text)
returns integer language sql security invoker set search_path='' as $$
  select private.assign_preset_question_ideas(p_entries,p_reason);
$$;

create function private.preset_selection_keys(p_revision_id uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; idea text; keys text[]; families text[];
begin
  select * into v from public.question_revisions where id=p_revision_id;
  idea:=private.preset_question_idea(p_revision_id);
  if not found or idea is null then return null; end if;
  -- A shared answer is deliberately absent. It cannot identify a duplicate.
  keys:=array['idea:'||idea,'wording:'||md5(lower(regexp_replace(btrim(v.prompt),'\s+',' ','g')))];
  select array_agg(distinct 'family:'||md5(i.source_namespace||':'||(r.source_fields->>'family_id'))) into families
    from public.catalogue_import_rows r join public.catalogue_imports i on i.id=r.import_id
    where i.owner_id=v.owner_id and i.source_bank_id=v.bank_id and r.catalogue_id=v.external_id
      and nullif(r.source_fields->>'family_id','') is not null;
  return keys||coalesce(families,array[]::text[]);
end;
$$;

create function private.preset_selection_is_distinct(p_revisions uuid[])
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from unnest(p_revisions) input(revision_id) where private.preset_selection_keys(input.revision_id) is null)
    and not exists(select 1 from unnest(p_revisions) input(revision_id) join public.question_revisions v on v.id=input.revision_id,
      unnest(private.preset_selection_keys(input.revision_id)) keys(key) group by v.unit,keys.key having count(*)>1);
$$;

revoke all on function private.preset_question_idea(uuid),private.preset_selection_keys(uuid),
  private.preset_selection_is_distinct(uuid[]),private.assign_preset_question_ideas(jsonb,text),
  public.assign_preset_question_ideas(jsonb,text) from public,anon,authenticated;
grant execute on function private.assign_preset_question_ideas(jsonb,text),public.assign_preset_question_ideas(jsonb,text) to authenticated;

create or replace function private.get_eligible_simple_presets(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Read up to 100 presets per page.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(value order by question_id),'[]'::jsonb) into result from (
    select v.question_id,jsonb_build_object('revisionId',v.id,'revision',v.revision,'curationId',r.id,
      'reviewVersion',p.review_version,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,
      'publisher',p.publisher_name,'publishedAt',p.published_at,'provenance',p.public_provenance,
      'question',private.preset_simple_question(v.id,1),'selectionKeys',to_jsonb(private.preset_selection_keys(v.id))) value
    from public.preset_curation r join public.preset_publications p on p.curation_id=r.id
    join public.question_revisions v on v.id=r.question_revision_id
    where (p_after is null or v.question_id>p_after) and v.unit=1
      and v.question_type in ('multiple-choice','binary','short-answer') and private.preset_question_is_eligible(v.id)
      and private.preset_selection_keys(v.id) is not null
      and not exists(select 1 from public.question_group_questions m where m.question_id=v.question_id)
    order by v.question_id limit p_limit) page;
  return result;
end;
$$;
create or replace function private.finalize_simple_preset_exam(p_request_id uuid,p_settings jsonb,p_selections jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.exam_snapshots%rowtype; request jsonb; entry jsonb; items jsonb:='[]';
  count_items integer; total integer:=0; v public.question_revisions%rowtype; r public.preset_curation%rowtype;
  p public.preset_publications%rowtype; marks integer; position integer:=0;
begin
  if actor is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_selections) is distinct from 'array'
    or octet_length(p_settings::text)+octet_length(p_selections::text)>100000 then
    raise exception 'Invalid bounded preset request.' using errcode='23514'; end if;
  count_items:=jsonb_array_length(p_selections);
  if count_items not between 1 and 50 or (select count(distinct x->>'revisionId') from jsonb_array_elements(p_selections) x)<>count_items
    or p_settings->'grade' is distinct from '6'::jsonb or p_settings->'unit' is distinct from '1'::jsonb
    or p_settings->'questionCount' is distinct from to_jsonb(count_items)
    or jsonb_typeof(p_settings->'selectionSeed') is distinct from 'number'
    or p_settings->>'selectionSeed' !~ '^[0-9]+$' or (p_settings->>'selectionSeed')::numeric>4294967295
    or jsonb_typeof(p_settings->'schoolName') is distinct from 'string' or char_length(btrim(p_settings->>'schoolName')) not between 1 and 80
    or jsonb_typeof(p_settings->'examTitle') is distinct from 'string' or char_length(btrim(p_settings->>'examTitle')) not between 1 and 80
    or jsonb_typeof(p_settings->'teacherName') is distinct from 'string' or char_length(p_settings->>'teacherName')>80
    or p_settings->>'marksPerQuestion' !~ '^[0-9]+$' or (p_settings->>'marksPerQuestion')::integer not between 1 and 20
    or (select array_agg(key order by key) from jsonb_object_keys(p_settings) key) is distinct from
      array['examTitle','grade','marksPerQuestion','questionCount','schoolName','selectionSeed','teacherName','unit']::text[] then
    raise exception 'Use supported Grade 6 Unit 1 simple-paper settings.' using errcode='23514'; end if;
  request:=jsonb_build_object('settings',p_settings,'selections',p_selections);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,0));
  select * into s from public.exam_snapshots where owner_id=actor and request_id=p_request_id;
  if found then
    if s.settings->>'kind' is distinct from 'governed-preset-simple' or s.settings->'request' is distinct from request then
      raise exception 'Retry identity belongs to a different request.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
      'settings',s.settings#>'{request,settings}','items',s.structure->'items','totalMarks',s.total_marks);
  end if;
  -- Stable row locks serialize publication/withdrawal/source correction with capture.
  perform r0.id from public.preset_curation r0 where r0.id in
    (select (x->>'curationId')::uuid from jsonb_array_elements(p_selections) x) order by r0.id for share;
  perform q.id from public.questions q join public.question_revisions v0 on v0.question_id=q.id
    where v0.id in (select (x->>'revisionId')::uuid from jsonb_array_elements(p_selections) x) order by q.id for share of q;
  for entry in select x from jsonb_array_elements(p_selections) x loop
    if jsonb_typeof(entry) is distinct from 'object' or
      (select array_agg(key order by key) from jsonb_object_keys(entry) key) is distinct from
      array['curationId','isLocked','marks','reviewVersion','revisionId']::text[]
      or jsonb_typeof(entry->'isLocked') is distinct from 'boolean' or entry->>'marks' !~ '^[0-9]+$'
      or jsonb_typeof(entry->'marks') is distinct from 'number' then
      raise exception 'Invalid preset selection.' using errcode='23514'; end if;
    marks:=(entry->>'marks')::integer;
    if marks not between 1 and 20 then raise exception 'Marks must be whole numbers from 1 to 20.' using errcode='23514'; end if;
    select * into v from public.question_revisions where id=(entry->>'revisionId')::uuid;
    select * into r from public.preset_curation where id=(entry->>'curationId')::uuid;
    select * into p from public.preset_publications where curation_id=r.id;
    if v.id is null or r.id is null or p.curation_id is null or r.question_revision_id<>v.id
      or entry->'reviewVersion' is distinct from to_jsonb(p.review_version) or v.unit<>1
      or not private.preset_question_is_eligible(v.id)
      or exists(select 1 from public.question_group_questions m where m.question_id=v.question_id) then
      raise exception 'Selected preset is unpublished, withdrawn, changed or requires its complete group.' using errcode='40001'; end if;
    total:=total+marks;
    items:=items||jsonb_build_array(entry||jsonb_build_object('question',private.preset_simple_question(v.id,marks),'provenance',p.public_provenance));
  end loop;
  if (select count(distinct v0.question_id) from public.question_revisions v0
    where v0.id in (select (x->>'revisionId')::uuid from jsonb_array_elements(p_selections) x))<>count_items then
    raise exception 'One canonical question cannot appear twice.' using errcode='23514'; end if;
  if not private.preset_selection_is_distinct(array(select (x->>'revisionId')::uuid from jsonb_array_elements(p_selections) x)) then
    raise exception 'Use distinct question ideas and wording within each unit.' using errcode='23514'; end if;
  insert into public.exam_snapshots(owner_id,schema_version,selection_seed,settings,structure,total_marks,request_id,document_status)
    values(actor,1,(p_settings->>'selectionSeed')::bigint,jsonb_build_object('schemaVersion',1,'kind','governed-preset-simple','request',request),
      jsonb_build_object('schemaVersion',1,'items',items),total,p_request_id,'needs-review') returning * into s;
  for entry in select x from jsonb_array_elements(items) x loop
    position:=position+1;
    insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,publisher_owner_id,position,is_locked,assigned_marks,point_marks,mark_attempt_count)
      select s.id,v0.id,actor,v0.owner_id,position,(entry->>'isLocked')::boolean,(entry->>'marks')::integer,
        jsonb_build_object(v0.question_id::text,(entry->>'marks')::integer),1
      from public.question_revisions v0 where v0.id=(entry->>'revisionId')::uuid;
  end loop;
  update public.exam_snapshots set sealed=true where id=s.id returning * into s;
  return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',p_settings,'items',items,'totalMarks',s.total_marks);
end;
$$;
create or replace function private.preset_simple_group(p_group_id uuid,p_marks integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.question_groups%rowtype; members jsonb; n integer; attempts integer;
begin
  select * into g from public.question_groups where id=p_group_id;
  if not found or g.group_type<>'branch' or g.parent_group_id is not null or g.instructions is null
    or char_length(btrim(g.instructions)) not between 1 and 1000 then return null; end if;
  select count(*) into n from public.question_group_questions where group_id=g.id;
  attempts:=coalesce(g.attempt_count,n);
  if n not between 1 and 50 or attempts not between 1 and n or exists(
    select 1 from public.question_group_questions m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.group_id=g.id and (v.unit<>1 or v.question_type not in ('multiple-choice','binary','short-answer')
      or not private.preset_question_is_eligible(v.id)
      or (select count(*) from public.question_group_questions other where other.question_id=q.id)<>1))
    or (select max(position) from public.question_group_questions where group_id=g.id)<>n then return null; end if;
  if not private.preset_selection_is_distinct(array(select v.id from public.question_group_questions m
    join public.questions q on q.id=m.question_id join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.group_id=g.id)) then return null; end if;
  select jsonb_agg(jsonb_build_object('revisionId',v.id,'curationId',r.id,'reviewVersion',p.review_version,
    'revision',v.revision,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,'publisher',p.publisher_name,
    'publishedAt',p.published_at,'provenance',p.public_provenance,'selectionKeys',to_jsonb(private.preset_selection_keys(v.id)),'question',private.preset_simple_question(v.id,p_marks)) order by m.position)
    into members from public.question_group_questions m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    join public.preset_curation r on r.question_revision_id=v.id join public.preset_publications p on p.curation_id=r.id
    where m.group_id=g.id;
  if jsonb_array_length(members) is distinct from n then return null; end if;
  return jsonb_build_object('id',g.id,'revision',g.revision,'instruction',g.instructions,
    'attemptCount',attempts,'members',members);
end;
$$;
create or replace function private.get_preset_curation(p_bank_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare details jsonb; records jsonb;
begin
  details:=private.get_preset_curation_base(p_bank_id);
  select coalesce(jsonb_agg(record||jsonb_build_object('published',p.curation_id is not null,'publication',
    case when p.curation_id is null then null else jsonb_build_object('reviewVersion',p.review_version,
      'publisher',p.publisher_name,'publishedAt',p.published_at,'publicProvenance',p.public_provenance,
      'eligible',private.preset_question_is_eligible((record->>'revisionId')::uuid)) end) order by ordinal),'[]'::jsonb)
    into records from jsonb_array_elements(details->'records') with ordinality e(record,ordinal)
    left join public.preset_publications p on p.curation_id=(record->>'id')::uuid;
  return jsonb_set(jsonb_set(details,'{records}',records),'{targets}',
    (select coalesce(jsonb_agg(t||jsonb_build_object('ideaKey',private.preset_question_idea((t->>'revisionId')::uuid)) order by n),'[]'::jsonb)
      from jsonb_array_elements(details->'targets') with ordinality items(t,n)));
end;
$$;
commit;
