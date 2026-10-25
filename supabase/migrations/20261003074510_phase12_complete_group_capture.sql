begin;
-- A bounded complete generation unit reuses the existing sealed aggregate.
-- Only the existing Unit 1 simple types are rendered; no curriculum variants.
create function private.preset_simple_group(p_group_id uuid,p_marks integer)
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
  select jsonb_agg(jsonb_build_object('revisionId',v.id,'curationId',r.id,'reviewVersion',p.review_version,
    'revision',v.revision,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,'publisher',p.publisher_name,
    'publishedAt',p.published_at,'provenance',p.public_provenance,'question',private.preset_simple_question(v.id,p_marks)) order by m.position)
    into members from public.question_group_questions m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    join public.preset_curation r on r.question_revision_id=v.id join public.preset_publications p on p.curation_id=r.id
    where m.group_id=g.id;
  if jsonb_array_length(members) is distinct from n then return null; end if;
  return jsonb_build_object('id',g.id,'revision',g.revision,'instruction',g.instructions,
    'attemptCount',attempts,'members',members);
end;
$$;

create function private.get_eligible_simple_preset_groups(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_limit is null then raise exception 'Invalid page bound.' using errcode='23514'; end if;
  return (select coalesce(jsonb_agg(value order by id),'[]'::jsonb) from (
    select g.id,private.preset_simple_group(g.id,1) value from public.question_groups g
    where (p_after is null or g.id>p_after) and exists(select 1 from public.question_group_questions m
      join public.question_revisions v on v.question_id=m.question_id join public.preset_curation r on r.question_revision_id=v.id
      join public.preset_publications p on p.curation_id=r.id where m.group_id=g.id and r.state='approved')
      and private.preset_simple_group(g.id,1) is not null
    order by g.id limit p_limit) page);
end;
$$;

create or replace function private.guard_preset_snapshot_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype;
begin
  select * into s from public.exam_snapshots where id=new.snapshot_id;
  if new.publisher_owner_id is not null and (s.settings->>'kind' not in ('governed-preset-simple','governed-preset-group')
    or s.settings->>'kind' is null or s.workflow is not null or s.owner_id is distinct from new.owner_id
    or new.source_group_id is not null) then
    raise exception 'Publisher revisions require the governed snapshot capture path.' using errcode='23514'; end if;
  return new;
end;
$$;

create function private.check_complete_preset_group_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype; n integer; point_mark integer; attempts integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.settings->>'kind' is distinct from 'governed-preset-group' then return null; end if;
  n:=jsonb_array_length(s.structure#>'{group,members}');
  point_mark:=(s.settings#>>'{request,marks}')::integer;attempts:=(s.structure#>>'{group,attemptCount}')::integer;
  if not s.sealed or s.workflow is not null or s.source_draft_id is not null or s.request_id is null
    or s.schema_version<>1 or s.settings->'schemaVersion' is distinct from '1'::jsonb
    or s.structure->'schemaVersion' is distinct from '1'::jsonb
    or n not between 1 and 50 or point_mark not between 1 and 20 or attempts not between 1 and n
    or s.total_marks is distinct from point_mark*attempts
    or s.structure#>'{group,id}' is distinct from s.settings#>'{request,groupId}'
    or s.structure#>'{group,revision}' is distinct from s.settings#>'{request,groupRevision}'
    or s.settings#>'{request,settings,questionCount}' is distinct from to_jsonb(n)
    or s.settings#>'{request,settings,selectionSeed}' is distinct from to_jsonb(s.selection_seed)
    or (select count(*) from public.exam_snapshot_questions where snapshot_id=s.id)<>n
    or exists(select 1 from jsonb_array_elements(s.structure#>'{group,members}') with ordinality e(item,position)
      left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=e.position
      left join public.question_revisions v on v.id=c.question_revision_id
      left join public.preset_curation r on r.id=(item->>'curationId')::uuid
      left join public.preset_publications p on p.curation_id=r.id
      where c.owner_id is distinct from s.owner_id or c.publisher_owner_id is distinct from v.owner_id
        or item->>'revisionId' is distinct from v.id::text or r.question_revision_id is distinct from v.id
        or item->'reviewVersion' is distinct from to_jsonb(p.review_version)
        or item->'provenance' is distinct from p.public_provenance
        or item->'question' is distinct from private.preset_simple_question(v.id,point_mark)
        or c.is_locked is distinct from true or c.assigned_marks is distinct from point_mark or c.source_group_id is not null
        or c.point_marks is distinct from jsonb_build_object(v.question_id::text,point_mark)
        or c.mark_attempt_count is distinct from 1)
    or s.structure->'group' is distinct from private.preset_simple_group((s.structure#>>'{group,id}')::uuid,point_mark) then
    raise exception 'Preset group requires its complete exact sealed aggregate.' using errcode='23514'; end if;
  return null;
end;
$$;
create constraint trigger exam_snapshots_preset_group_complete after insert or update on public.exam_snapshots
  deferrable initially deferred for each row execute function private.check_complete_preset_group_snapshot();

create function private.finalize_simple_preset_group(p_request_id uuid,p_settings jsonb,p_group_id uuid,p_group_revision integer,p_marks integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.exam_snapshots%rowtype; request jsonb; captured jsonb; item jsonb; position integer:=0;
begin
  if actor is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  if p_group_id is null or p_group_revision is null or p_marks is null or p_marks not between 1 and 20
    or jsonb_typeof(p_settings) is distinct from 'object' or octet_length(p_settings::text)>100000
    or p_settings->'grade' is distinct from '6'::jsonb or p_settings->'unit' is distinct from '1'::jsonb
    or p_settings->>'selectionSeed' !~ '^[0-9]+$' or jsonb_typeof(p_settings->'selectionSeed') is distinct from 'number'
    or (p_settings->>'selectionSeed')::numeric>4294967295
    or jsonb_typeof(p_settings->'schoolName') is distinct from 'string' or char_length(btrim(p_settings->>'schoolName')) not between 1 and 80
    or jsonb_typeof(p_settings->'examTitle') is distinct from 'string' or char_length(btrim(p_settings->>'examTitle')) not between 1 and 80
    or jsonb_typeof(p_settings->'teacherName') is distinct from 'string' or char_length(p_settings->>'teacherName')>80
    or p_settings->'marksPerQuestion' is distinct from to_jsonb(p_marks)
    or (select array_agg(key order by key) from jsonb_object_keys(p_settings) key) is distinct from
      array['examTitle','grade','marksPerQuestion','questionCount','schoolName','selectionSeed','teacherName','unit']::text[] then
    raise exception 'Invalid complete-group teacher request.' using errcode='23514'; end if;
  request:=jsonb_build_object('settings',p_settings,'groupId',p_group_id,'groupRevision',p_group_revision,'marks',p_marks);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,0));
  select * into s from public.exam_snapshots where owner_id=actor and request_id=p_request_id;
  if found then
    if s.settings->>'kind' is distinct from 'governed-preset-group' or s.settings->'request' is distinct from request then
      raise exception 'Retry identity belongs to different paper contents.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
      'settings',s.settings#>'{request,settings}','group',s.structure->'group','totalMarks',s.total_marks);
  end if;
  perform r.id from public.preset_curation r join public.question_revisions v on v.id=r.question_revision_id
    join public.question_group_questions m on m.question_id=v.question_id where m.group_id=p_group_id order by r.id for share of r;
  perform q.id from public.questions q join public.question_group_questions m on m.question_id=q.id
    where m.group_id=p_group_id order by q.id for share of q;
  perform g.id from public.question_groups g where g.id=p_group_id for share;
  captured:=private.preset_simple_group(p_group_id,p_marks);
  if captured is null or captured->'revision' is distinct from to_jsonb(p_group_revision) then
    raise exception 'Complete published group changed or is unavailable.' using errcode='40001'; end if;
  if p_settings->'questionCount' is distinct from to_jsonb(jsonb_array_length(captured->'members')) then
    raise exception 'Capture every group member in source order.' using errcode='23514'; end if;
  insert into public.exam_snapshots(owner_id,schema_version,selection_seed,settings,structure,total_marks,request_id,document_status)
    values(actor,1,(p_settings->>'selectionSeed')::bigint,jsonb_build_object('schemaVersion',1,'kind','governed-preset-group','request',request),
      jsonb_build_object('schemaVersion',1,'group',captured),p_marks*(captured->>'attemptCount')::integer,p_request_id,'needs-review') returning * into s;
  for item in select x from jsonb_array_elements(captured->'members') x loop
    position:=position+1;
    insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,publisher_owner_id,position,is_locked,assigned_marks,point_marks,mark_attempt_count)
      select s.id,v.id,actor,v.owner_id,position,true,p_marks,jsonb_build_object(v.question_id::text,p_marks),1
      from public.question_revisions v where v.id=(item->>'revisionId')::uuid;
  end loop;
  update public.exam_snapshots set sealed=true where id=s.id returning * into s;
  return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',p_settings,'group',captured,'totalMarks',s.total_marks);
end;
$$;
create function private.get_simple_preset_group_exams()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',s.settings#>'{request,settings}','group',s.structure->'group','totalMarks',s.total_marks) order by s.created_at desc),'[]'::jsonb)
    from public.exam_snapshots s where s.owner_id=auth.uid() and s.sealed and s.settings->>'kind'='governed-preset-group');
end;
$$;
create function public.get_eligible_simple_preset_groups(p_after uuid default null,p_limit integer default 100)
returns jsonb language sql security invoker set search_path='' as $$ select private.get_eligible_simple_preset_groups(p_after,p_limit); $$;
create function public.finalize_simple_preset_group(p_request_id uuid,p_settings jsonb,p_group_id uuid,p_group_revision integer,p_marks integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.finalize_simple_preset_group(p_request_id,p_settings,p_group_id,p_group_revision,p_marks); $$;
create function public.get_simple_preset_group_exams()
returns jsonb language sql security invoker set search_path='' as $$ select private.get_simple_preset_group_exams(); $$;
revoke all on function private.preset_simple_group(uuid,integer),private.check_complete_preset_group_snapshot(),
  private.get_eligible_simple_preset_groups(uuid,integer),public.get_eligible_simple_preset_groups(uuid,integer),
  private.finalize_simple_preset_group(uuid,jsonb,uuid,integer,integer),public.finalize_simple_preset_group(uuid,jsonb,uuid,integer,integer),
  private.get_simple_preset_group_exams(),public.get_simple_preset_group_exams() from public,anon,authenticated;
grant execute on function private.get_eligible_simple_preset_groups(uuid,integer),public.get_eligible_simple_preset_groups(uuid,integer),
  private.finalize_simple_preset_group(uuid,jsonb,uuid,integer,integer),public.finalize_simple_preset_group(uuid,jsonb,uuid,integer,integer),
  private.get_simple_preset_group_exams(),public.get_simple_preset_group_exams() to authenticated;
commit;
