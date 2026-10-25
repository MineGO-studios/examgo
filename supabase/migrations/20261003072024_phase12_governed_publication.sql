begin;

-- Publication is a separate named decision. Private curation evidence is never
-- copied implicitly into an all-teacher projection.
create table public.preset_publications (
  curation_id uuid primary key references public.preset_curation(id) on delete restrict,
  review_version integer not null check(review_version>0),
  public_provenance jsonb not null,
  source_groups jsonb not null,
  publisher_id uuid not null references private.preset_reviewers(user_id) on delete restrict,
  publisher_name text not null,
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  published_at timestamptz not null default now()
);
alter table public.preset_publications enable row level security;
revoke all on public.preset_publications from public,anon,authenticated;
create trigger preset_publications_immutable before update or delete on public.preset_publications
  for each row execute function private.preset_history_immutable();

create function private.preset_source_groups(p_question_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'revision',g.revision,
    'members',(select jsonb_agg(m.question_id order by m.position) from public.question_group_questions m where m.group_id=g.id))
    order by g.id),'[]'::jsonb)
  from public.question_groups g join public.question_group_questions x on x.group_id=g.id
  where x.question_id=p_question_id;
$$;

create function private.publish_preset_revision(p_id uuid,p_expected_version integer,p_public_provenance jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); name text:=private.preset_reviewer_name(); r public.preset_curation%rowtype;
  qid uuid; groups jsonb; saved public.preset_publications%rowtype; k text;
begin
  if actor is null or name is null then raise exception 'Preset publisher authority required.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A publication reason is required.' using errcode='23514'; end if;
  perform private.validate_preset_provenance(p_public_provenance);
  select * into r from public.preset_curation where id=p_id for update;
  if not found then raise exception 'Review is inaccessible.' using errcode='42501'; end if;
  if r.version is distinct from p_expected_version then raise exception 'Review changed.' using errcode='40001'; end if;
  if r.state<>'approved' or r.question_revision_id is null or r.approved_at is null or r.reviewer_id is null then
    raise exception 'Publish only an explicitly approved exact question revision.' using errcode='23514'; end if;
  -- These assessed facts cannot be changed during public redaction. Text fields
  -- are deliberately supplied by the publisher as neutral public references.
  foreach k in array array['schemaVersion','curriculumVersion','sourceKind','sourceEvidence','rightsStatus','ministerialOccurrences','missingEvidence'] loop
    if p_public_provenance->k is distinct from r.provenance->k then
      raise exception 'Public facts differ from the approval.' using errcode='23514'; end if;
  end loop;
  if btrim(p_public_provenance->>'author')='' or btrim(p_public_provenance->>'sourceReference')=''
    or btrim(p_public_provenance->>'answerEvidence')='' or btrim(p_public_provenance->>'rightsEvidence')=''
    or (p_public_provenance->'ministerialOccurrences'<>'null'::jsonb and btrim(p_public_provenance->>'corpusScope')='') then
    raise exception 'Public provenance must retain complete inspectable evidence.' using errcode='23514'; end if;
  perform 1 from public.question_banks b where b.id=r.bank_id and not b.is_archived for share;
  if not found then raise exception 'Archived source bank.' using errcode='40001'; end if;
  select q.id into qid from public.questions q join public.question_revisions v on v.question_id=q.id
    where v.id=r.question_revision_id and q.owner_id=r.owner_id and v.revision=q.current_revision and q.is_active
    for share of q;
  if not found then raise exception 'Current active source revision required.' using errcode='40001'; end if;
  -- Stabilize group identity/order against concurrent source corrections.
  perform g.id from public.question_groups g join public.question_group_questions m on m.group_id=g.id
    where m.question_id=qid order by g.id for share of g;
  groups:=private.preset_source_groups(qid);
  select * into saved from public.preset_publications where curation_id=r.id;
  if found then
    if saved.review_version<>r.version or saved.public_provenance<>p_public_provenance or saved.source_groups<>groups or saved.reason<>p_reason then
      raise exception 'Publication retry differs from its recorded decision.' using errcode='23505'; end if;
  else
    insert into public.preset_publications(curation_id,review_version,public_provenance,source_groups,publisher_id,publisher_name,reason)
      values(r.id,r.version,p_public_provenance,groups,actor,name,p_reason) returning * into saved;
  end if;
  return jsonb_build_object('curationId',saved.curation_id,'reviewVersion',saved.review_version,
    'publisher',saved.publisher_name,'publishedAt',saved.published_at);
end;
$$;

create function private.preset_revision_is_eligible(p_revision_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.preset_curation r join public.preset_publications p on p.curation_id=r.id
    join public.question_revisions v on v.id=r.question_revision_id join public.questions q on q.id=v.question_id
    join public.question_banks b on b.id=r.bank_id
    where v.id=p_revision_id and r.state='approved' and r.version=p.review_version
      and q.is_active and q.current_revision=v.revision and not b.is_archived
      and p.source_groups=private.preset_source_groups(q.id));
$$;

-- A grouped question is eligible only when every member has an approved current
-- publication. This does not allow a partial passage/completion into selection.
create function private.preset_question_is_eligible(p_revision_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.preset_revision_is_eligible(p_revision_id) and not exists(
    select 1 from public.question_revisions v join public.question_group_questions mine on mine.question_id=v.question_id
    join public.question_group_questions sibling on sibling.group_id=mine.group_id
    join public.questions q on q.id=sibling.question_id
    left join public.question_revisions current on current.question_id=q.id and current.revision=q.current_revision
    where v.id=p_revision_id and (current.id is null or not private.preset_revision_is_eligible(current.id)));
$$;

create function public.publish_preset_revision(p_id uuid,p_expected_version integer,p_public_provenance jsonb,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.publish_preset_revision(p_id,p_expected_version,p_public_provenance,p_reason);
$$;
revoke all on function private.preset_source_groups(uuid),private.preset_revision_is_eligible(uuid),private.preset_question_is_eligible(uuid),
  private.publish_preset_revision(uuid,integer,jsonb,text),public.publish_preset_revision(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function private.publish_preset_revision(uuid,integer,jsonb,text),public.publish_preset_revision(uuid,integer,jsonb,text) to authenticated;

alter function private.get_preset_curation(uuid) rename to get_preset_curation_base;
revoke all on function private.get_preset_curation_base(uuid) from public,anon,authenticated;
create function private.get_preset_curation(p_bank_id uuid)
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
  return jsonb_set(details,'{records}',records);
end;
$$;
revoke all on function private.get_preset_curation(uuid) from public,anon,authenticated;
grant execute on function private.get_preset_curation(uuid) to authenticated;

-- Reuse the sealed snapshot aggregate. Existing source ownership is unchanged;
-- only protected preset finalization can capture a distinct revision owner.
alter table public.exam_snapshot_questions
  add column publisher_owner_id uuid,
  add column revision_owner_id uuid generated always as (coalesce(publisher_owner_id,owner_id)) stored;
alter table public.exam_snapshot_questions drop constraint exam_snapshot_questions_revision_owner_fkey;
alter table public.exam_snapshot_questions add constraint exam_snapshot_questions_revision_owner_fkey
  foreign key(question_revision_id,revision_owner_id) references public.question_revisions(id,owner_id) on delete restrict;
create index exam_snapshot_questions_publisher_idx on public.exam_snapshot_questions(publisher_owner_id) where publisher_owner_id is not null;

create function private.preset_simple_question(p_revision_id uuid,p_marks integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; value jsonb; options jsonb; correct jsonb;
begin
  select * into v from public.question_revisions where id=p_revision_id;
  if not found or v.question_type not in ('multiple-choice','binary','short-answer') then
    raise exception 'Simple preset renderer requires a supported source revision.' using errcode='23514'; end if;
  value:=jsonb_build_object('id',v.question_id,'type',v.question_type,'unit',v.unit,'lesson',v.lesson,
    'difficulty',v.difficulty,'prompt',v.prompt,'marks',p_marks);
  if v.question_type='multiple-choice' then
    select jsonb_agg(jsonb_build_object('label',x->'label','text',x->'text') order by n)
      into options from jsonb_array_elements(v.content->'options') with ordinality elements(x,n);
    select x into correct from jsonb_array_elements(options) x where x->>'label'=v.answer->>'correctOptionLabel';
    if correct is null then raise exception 'Source answer is invalid.' using errcode='23514'; end if;
    value:=value||jsonb_build_object('options',options,'correctAnswer',correct);
  elsif v.question_type='binary' then
    value:=value||jsonb_build_object('labelMode',v.content->'labelMode','isTrue',v.answer->'isTrue');
  else
    value:=value||jsonb_build_object('answerLines',coalesce(v.content->'answerLines','2'::jsonb),
      'canonicalAnswer',v.answer->'canonicalAnswer','approvedVariants',coalesce(v.answer->'approvedVariants','[]'::jsonb),
      'caseSensitive',coalesce(v.answer->'caseSensitive','false'::jsonb));
  end if;
  return value;
end;
$$;

create function private.get_eligible_simple_presets(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Read up to 100 presets per page.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(value order by question_id),'[]'::jsonb) into result from (
    select v.question_id,jsonb_build_object('revisionId',v.id,'revision',v.revision,'curationId',r.id,
      'reviewVersion',p.review_version,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,
      'publisher',p.publisher_name,'publishedAt',p.published_at,'provenance',p.public_provenance,
      'question',private.preset_simple_question(v.id,1)) value
    from public.preset_curation r join public.preset_publications p on p.curation_id=r.id
    join public.question_revisions v on v.id=r.question_revision_id
    where (p_after is null or v.question_id>p_after) and v.unit=1
      and v.question_type in ('multiple-choice','binary','short-answer') and private.preset_question_is_eligible(v.id)
      and not exists(select 1 from public.question_group_questions m where m.question_id=v.question_id)
    order by v.question_id limit p_limit) page;
  return result;
end;
$$;

create function private.guard_preset_snapshot_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype;
begin
  select * into s from public.exam_snapshots where id=new.snapshot_id;
  if new.publisher_owner_id is not null and (s.settings->>'kind' is distinct from 'governed-preset-simple'
    or s.workflow is not null or s.owner_id is distinct from new.owner_id or new.source_group_id is not null) then
    raise exception 'Publisher revisions require the governed snapshot capture path.' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger exam_snapshot_questions_preset_source before insert or update on public.exam_snapshot_questions
  for each row execute function private.guard_preset_snapshot_source();

create function private.check_complete_preset_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype; n integer; total integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.settings->>'kind' is distinct from 'governed-preset-simple' then return null; end if;
  n:=jsonb_array_length(s.structure->'items');
  select sum(assigned_marks) into total from public.exam_snapshot_questions where snapshot_id=s.id;
  if not s.sealed or s.workflow is not null or s.source_draft_id is not null or s.request_id is null
    or s.schema_version<>1 or s.settings->'schemaVersion' is distinct from '1'::jsonb
    or s.structure->'schemaVersion' is distinct from '1'::jsonb
    or s.settings#>'{request,settings,questionCount}' is distinct from to_jsonb(n)
    or s.settings#>'{request,settings,selectionSeed}' is distinct from to_jsonb(s.selection_seed)
    or n not between 1 and 50 or s.total_marks is distinct from total
    or (select count(*) from public.exam_snapshot_questions where snapshot_id=s.id)<>n
    or exists(select 1 from jsonb_array_elements(s.structure->'items') with ordinality e(item,position)
      left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=e.position
      left join public.question_revisions v on v.id=c.question_revision_id
      left join public.preset_curation r on r.id=(item->>'curationId')::uuid
      left join public.preset_publications p on p.curation_id=r.id
      where c.owner_id is distinct from s.owner_id or c.publisher_owner_id is distinct from v.owner_id
        or item->>'revisionId' is distinct from v.id::text or r.question_revision_id is distinct from v.id
        or item->'reviewVersion' is distinct from to_jsonb(p.review_version)
        or item->'provenance' is distinct from p.public_provenance
        or item->'question' is distinct from private.preset_simple_question(v.id,c.assigned_marks)
        or c.is_locked is distinct from (item->>'isLocked')::boolean
        or c.assigned_marks is distinct from (item->>'marks')::integer or c.source_group_id is not null
        or c.point_marks is distinct from jsonb_build_object(v.question_id::text,c.assigned_marks)
        or c.mark_attempt_count is distinct from 1)
    or s.settings#>'{request,selections}' is distinct from
      (select jsonb_agg(item-'question'-'provenance' order by position)
       from jsonb_array_elements(s.structure->'items') with ordinality e(item,position)) then
    raise exception 'Governed snapshot must capture the exact complete sealed aggregate.' using errcode='23514'; end if;
  return null;
end;
$$;
create constraint trigger exam_snapshots_preset_complete after insert or update on public.exam_snapshots
  deferrable initially deferred for each row execute function private.check_complete_preset_snapshot();

create function private.finalize_simple_preset_exam(p_request_id uuid,p_settings jsonb,p_selections jsonb)
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

create function private.get_simple_preset_exams()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',s.settings#>'{request,settings}','items',s.structure->'items','totalMarks',s.total_marks) order by s.created_at desc),'[]'::jsonb)
    from public.exam_snapshots s where s.owner_id=auth.uid() and s.sealed and s.settings->>'kind'='governed-preset-simple');
end;
$$;
create function public.get_eligible_simple_presets(p_after uuid default null,p_limit integer default 100)
returns jsonb language sql security invoker set search_path='' as $$ select private.get_eligible_simple_presets(p_after,p_limit); $$;
create function public.finalize_simple_preset_exam(p_request_id uuid,p_settings jsonb,p_selections jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.finalize_simple_preset_exam(p_request_id,p_settings,p_selections); $$;
create function public.get_simple_preset_exams()
returns jsonb language sql security invoker set search_path='' as $$ select private.get_simple_preset_exams(); $$;
revoke all on function private.preset_simple_question(uuid,integer),private.guard_preset_snapshot_source(),private.check_complete_preset_snapshot(),
  private.get_eligible_simple_presets(uuid,integer),public.get_eligible_simple_presets(uuid,integer),
  private.finalize_simple_preset_exam(uuid,jsonb,jsonb),public.finalize_simple_preset_exam(uuid,jsonb,jsonb),
  private.get_simple_preset_exams(),public.get_simple_preset_exams() from public,anon,authenticated;
grant execute on function private.get_eligible_simple_presets(uuid,integer),public.get_eligible_simple_presets(uuid,integer),
  private.finalize_simple_preset_exam(uuid,jsonb,jsonb),public.finalize_simple_preset_exam(uuid,jsonb,jsonb),
  private.get_simple_preset_exams(),public.get_simple_preset_exams() to authenticated;
commit;
