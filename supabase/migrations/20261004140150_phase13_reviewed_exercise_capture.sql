begin;

-- ECMAScript trim whitespace, shared by the production domain parsers.
create function private.preset_capture_trim(value text)
returns text language sql immutable security invoker set search_path='' as $$
  select btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
    chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
create function private.preset_capture_text(value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(value)='string' and private.preset_capture_trim(value#>>'{}')<>'',false);
$$;
create function private.preset_capture_text_array(value jsonb,minimum integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  return jsonb_array_length(value)>=minimum and not exists(
    select 1 from jsonb_array_elements(value) x where not private.preset_capture_text(x));
end;
$$;
create function private.preset_capture_integer(value jsonb,minimum integer,maximum bigint)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(value)='number' and value::text ~ '^[0-9]+$'
    and case when value::text ~ '^[0-9]+$' then value::text::numeric between minimum and maximum else false end,false);
$$;

create function private.valid_preset_capture_settings(s jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>100000 then return false; end if;
  return (select array_agg(key order by key) from jsonb_object_keys(s) key)=
      array['examTitle','grade','schemaVersion','schoolName','selectionSeed','teacherName','totalMarks']::text[]
    and s->'schemaVersion'='1'::jsonb and s->'grade'='6'::jsonb
    and private.preset_capture_integer(s->'selectionSeed',0,4294967295)
    and private.preset_capture_integer(s->'totalMarks',1,1000)
    and private.preset_capture_text(s->'schoolName') and char_length(s->>'schoolName')<=80
    and private.preset_capture_text(s->'examTitle') and char_length(s->>'examTitle')<=80
    and jsonb_typeof(s->'teacherName')='string' and char_length(s->>'teacherName')<=80;
end;
$$;

-- Validate the sanitized canonical payload, never a teacher-supplied answer or schema.
create function private.valid_preset_capture_payload(q jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare c jsonb:=q->'content'; a jsonb:=q->'answer'; side text; ids text[]; words text[];
  left_ids text[]; right_ids text[]; answers text[]; lines text[]; has_model boolean; has_rubric boolean; has_manual boolean;
begin
  if jsonb_typeof(q) is distinct from 'object' or jsonb_typeof(c) is distinct from 'object'
    or jsonb_typeof(a) is distinct from 'object' or q->'schemaVersion' is distinct from '1'::jsonb
    or c->'schemaVersion' is distinct from '1'::jsonb or a->'schemaVersion' is distinct from '1'::jsonb
    or c->'type' is distinct from q->'type' or a->'type' is distinct from q->'type'
    or not private.preset_capture_integer(q->'unit',1,4) or not private.preset_capture_text(q->'lesson')
    or not private.preset_capture_text(q->'prompt') or coalesce(q->>'difficulty' not in ('easy','medium','hard'),true)
    then return false; end if;
  case q->>'type'
    when 'multiple-choice' then
      if jsonb_typeof(c->'options') is distinct from 'array' then return false; end if;
      if jsonb_array_length(c->'options') not between 2 and 6 or exists(
        select 1 from jsonb_array_elements(c->'options') x where not private.preset_capture_text(x->'label')
          or not private.preset_capture_text(x->'text')) then return false; end if;
      select array_agg(upper(private.preset_capture_trim(x->>'label'))) into ids from jsonb_array_elements(c->'options') x;
      return (select count(distinct x) from unnest(ids) x)=cardinality(ids)
        and private.preset_capture_text(a->'correctOptionLabel') and upper(private.preset_capture_trim(a->>'correctOptionLabel'))=any(ids);
    when 'binary' then return coalesce(c->>'labelMode' in ('true-false','yes-no')
      and jsonb_typeof(a->'isTrue')='boolean',false);
    when 'short-answer' then
      if not private.preset_capture_text(a->'canonicalAnswer') or c ? 'answerLines'
        and not private.preset_capture_integer(c->'answerLines',1,20) then return false; end if;
      if a ? 'approvedVariants' then
        if not private.preset_capture_text_array(a->'approvedVariants',0) then return false; end if;
        select array_agg(lower(private.preset_capture_trim(x))) into words from jsonb_array_elements_text(a->'approvedVariants') x;
        if (select count(distinct x) from unnest(words) x)<>coalesce(cardinality(words),0)
          or lower(private.preset_capture_trim(a->>'canonicalAnswer'))=any(words) then return false; end if;
      end if;
      return true;
    when 'completion' then
      if not private.preset_capture_text(c->'text') or not private.preset_capture_text_array(c->'blankIds',1)
        or not private.preset_capture_text_array(c->'wordBank',1) or coalesce(c->>'wordBankOrder' not in ('ordered','unordered'),true)
        or jsonb_typeof(c->'allowWordReuse') is distinct from 'boolean'
        or jsonb_typeof(c->'requireAllWordsUsed') is distinct from 'boolean'
        or jsonb_typeof(a->'answers') is distinct from 'object' then return false; end if;
      select array_agg(x) into ids from jsonb_array_elements_text(c->'blankIds') x;
      select array_agg(lower(private.preset_capture_trim(x))) into words from jsonb_array_elements_text(c->'wordBank') x;
      select array_agg(lower(private.preset_capture_trim(a->'answers'->>id))) into answers from unnest(ids) id;
      if cardinality(ids)>200 or (select count(distinct x) from unnest(ids) x)<>cardinality(ids)
        or (select count(distinct x) from unnest(words) x)<>cardinality(words)
        or (select count(*) from jsonb_object_keys(a->'answers'))<>cardinality(ids)
        or exists(select 1 from unnest(ids) id where not private.preset_capture_text(a->'answers'->id))
        or not answers<@words or c->'allowWordReuse'='false'::jsonb
          and (select count(distinct x) from unnest(answers) x)<>cardinality(answers)
        or c->'requireAllWordsUsed'='true'::jsonb and not words<@answers then return false; end if;
      lines:=regexp_split_to_array(c->>'text',E'\r?\n');
      return cardinality(lines)=cardinality(ids) and not exists(select 1 from unnest(lines) line
        where regexp_count(line,'\.{3,}|_{3,}|'||chr(8230)||'+')<>1);
    when 'matching' then
      foreach side in array array['left','right'] loop
        if jsonb_typeof(c->side) is distinct from 'array' then return false; end if;
        if jsonb_array_length(c->side) not between 2 and 20 or exists(select 1 from jsonb_array_elements(c->side) x
          where not private.preset_capture_text(x->'id') or char_length(x->>'id')>100
            or not private.preset_capture_text(x->'text') or char_length(x->>'text')>1000) then return false; end if;
        select array_agg(x->>'id') into ids from jsonb_array_elements(c->side) x;
        if (select count(distinct x) from unnest(ids) x)<>cardinality(ids) then return false; end if;
        if side='left' then left_ids:=ids; else right_ids:=ids; end if;
      end loop;
      if cardinality(left_ids)<>cardinality(right_ids) or jsonb_typeof(a->'pairs') is distinct from 'array'
        then return false; end if;
      if jsonb_array_length(a->'pairs')<>cardinality(left_ids) or exists(select 1 from jsonb_array_elements(a->'pairs') x
        where not private.preset_capture_text(x->'leftId') or not private.preset_capture_text(x->'rightId')) then return false; end if;
      select array_agg(x->>'leftId'),array_agg(x->>'rightId') into ids,words from jsonb_array_elements(a->'pairs') x;
      return ids@>left_ids and ids<@left_ids and words@>right_ids and words<@right_ids
        and (select count(distinct x) from unnest(ids) x)=cardinality(ids)
        and (select count(distinct x) from unnest(words) x)=cardinality(words);
    when 'odd-word' then return private.preset_capture_text_array(c->'words',3)
      and private.preset_capture_text(a->'oddWord') and c->'words' @> jsonb_build_array(a->'oddWord');
    when 'word-relationship' then
      if not private.preset_capture_text_array(c->'words',2) then return false; end if;
      return jsonb_array_length(c->'words')=2 and private.preset_capture_text_array(a->'acceptedAnswers',1);
    when 'rewrite' then return private.preset_capture_text(c->'instruction')
      and private.preset_capture_text_array(a->'acceptedAnswers',1);
    when 'extended-writing' then
      if c ? 'minimumWords' and not private.preset_capture_integer(c->'minimumWords',1,1000)
        or c ? 'maximumWords' and not private.preset_capture_integer(c->'maximumWords',1,2000) then return false; end if;
      has_model:=private.preset_capture_text(a->'modelAnswer');
      has_rubric:=private.preset_capture_text_array(a->'rubricCriteria',1);
      has_manual:=coalesce(a->>'manualMarkingNote'='Manual marking '||chr(8212)||' no approved model provided',false);
      return (has_model or has_rubric)<>has_manual and (not a ? 'modelAnswer' or has_model)
        and (not a ? 'rubricCriteria' or has_rubric) and (not a ? 'manualMarkingNote' or has_manual)
        and (not c ?& array['minimumWords','maximumWords'] or (c->>'minimumWords')::numeric<=(c->>'maximumWords')::numeric);
    else return false;
  end case;
end;
$$;

create function private.valid_preset_capture_exercise(e jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'members') is distinct from 'array'
    or octet_length(e::text)>500000 then return false; end if;
  return jsonb_array_length(e->'members') between 1 and 50
    and coalesce(e->>'id','') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.preset_capture_text(e->'instruction') and char_length(e->>'instruction')<=1000
    and (e->'title'='null'::jsonb or private.preset_capture_text(e->'title') and char_length(e->>'title')<=200)
    and (e->'arabicInstruction'='null'::jsonb or private.preset_capture_text(e->'arabicInstruction') and char_length(e->>'arabicInstruction')<=1000)
    and (e->'passage'='null'::jsonb or private.preset_capture_text(e->'passage') and char_length(e->>'passage')<=5000)
    and not exists(select 1 from jsonb_array_elements(e->'members') m
      where private.valid_preset_capture_payload(m->'question') is distinct from true);
end;
$$;

create function private.preset_exercise_child_scoring(exercise jsonb,member jsonb,total integer)
returns table(assigned_marks smallint,point_marks jsonb,mark_attempt_count smallint)
language plpgsql immutable security invoker set search_path='' as $$
declare q jsonb:=member->'question'; ids text[]; point_mark integer; attempts integer:=(exercise->>'attemptCount')::integer;
begin
  if total is null or total not between 1 and 1000 or attempts is null or attempts<1 or total%attempts<>0 then
    raise exception 'Assign equal whole marks to attempted source points.' using errcode='23514'; end if;
  point_mark:=total/attempts;
  if exercise->>'kind'='passage' then ids:=array[(exercise->>'id')||':child:'||(q->>'id')];
  elsif q->>'type'='matching' then
    select array_agg((q->>'id')||':pair:'||(x->>'id') order by n) into ids
      from jsonb_array_elements(q#>'{content,left}') with ordinality e(x,n);
  elsif q->>'type'='completion' then
    select array_agg((q->>'id')||':blank:'||(x#>>'{}') order by n) into ids
      from jsonb_array_elements(q#>'{content,blankIds}') with ordinality e(x,n);
  else ids:=array[q->>'id']; end if;
  mark_attempt_count:=case when jsonb_array_length(exercise->'members')=1 then attempts else 1 end;
  assigned_marks:=point_mark*mark_attempt_count;
  select jsonb_object_agg(id,point_mark) into point_marks from unnest(ids) id;
  if cardinality(ids) not between 1 and 200 or (select count(*) from jsonb_object_keys(point_marks))<>cardinality(ids)
    or not public.valid_attempt_exam_point_marks(assigned_marks,point_marks,mark_attempt_count) then
    raise exception 'Exact source point scoring is invalid.' using errcode='23514'; end if;
  return next;
end;
$$;

-- Only this new kind is added. Historical guards keep their existing conditions.
create or replace function private.guard_preset_snapshot_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype;
begin
  select * into s from public.exam_snapshots where id=new.snapshot_id;
  if new.publisher_owner_id is not null and (s.settings->>'kind' not in
    ('governed-preset-simple','governed-preset-group','governed-reviewed-exercise')
    or s.settings->>'kind' is null or s.workflow is not null or s.owner_id is distinct from new.owner_id
    or new.source_group_id is not null) then
    raise exception 'Publisher revisions require the governed snapshot capture path.' using errcode='23514'; end if;
  return new;
end;
$$;

create function private.check_complete_reviewed_exercise_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype; exercise jsonb; n integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.settings->>'kind' is distinct from 'governed-reviewed-exercise' then return null; end if;
  exercise:=s.structure->'exercise';
  if private.valid_preset_capture_settings(s.settings#>'{request,settings}') is distinct from true
    or private.valid_preset_capture_exercise(exercise) is distinct from true then
    raise exception 'Complete valid teacher intent and source exercise required.' using errcode='23514'; end if;
  n:=jsonb_array_length(exercise->'members');
  if not s.sealed or s.workflow is not null or s.source_draft_id is not null or s.source_draft_version is not null
    or s.request_id is null or s.schema_version<>1 or s.settings->'schemaVersion' is distinct from '1'::jsonb
    or s.structure is distinct from jsonb_build_object('schemaVersion',1,'exercise',s.settings#>'{request,exercise}')
    or exercise is distinct from private.reviewed_preset_exercise((exercise->>'id')::uuid)
    or s.total_marks is distinct from (s.settings#>>'{request,settings,totalMarks}')::integer
    or s.selection_seed is distinct from (s.settings#>>'{request,settings,selectionSeed}')::bigint
    or n not between 1 and 50 or (select count(*) from public.exam_snapshot_questions where snapshot_id=s.id)<>n
    or exists(select 1 from jsonb_array_elements(exercise->'members') with ordinality e(member,position)
      left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=e.position
      left join public.question_revisions v on v.id=(member->>'revisionId')::uuid
      left join lateral private.preset_exercise_child_scoring(exercise,member,s.total_marks) scoring on true
      where c.question_revision_id is distinct from v.id or c.publisher_owner_id is distinct from v.owner_id
        or c.owner_id is distinct from s.owner_id or c.is_locked is distinct from true or c.source_group_id is not null
        or c.structure_path is distinct from jsonb_build_array(exercise->>'id',e.position::text)
        or c.visible_number is distinct from e.position::text or c.assigned_marks is distinct from scoring.assigned_marks
        or c.point_marks is distinct from scoring.point_marks or c.mark_attempt_count is distinct from scoring.mark_attempt_count
        or not private.valid_preset_capture_payload(member->'question')) then
    raise exception 'Reviewed exercise requires its exact complete sealed aggregate.' using errcode='23514'; end if;
  return null;
end;
$$;
create constraint trigger exam_snapshots_reviewed_exercise_complete after insert or update on public.exam_snapshots
  deferrable initially deferred for each row execute function private.check_complete_reviewed_exercise_snapshot();

create function private.finalize_reviewed_preset_exercise(p_request_id uuid,p_settings jsonb,p_exercise jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request jsonb; s public.exam_snapshots%rowtype; captured jsonb; member jsonb;
  source_group uuid; position integer:=0; total integer;
begin
  if actor is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_exercise) is distinct from 'object'
    or octet_length(p_settings::text)>100000 or octet_length(p_exercise::text)>500000 then
    raise exception 'Bounded teacher request and complete exercise required.' using errcode='23514'; end if;
  if private.valid_preset_capture_settings(p_settings) is distinct from true
    or coalesce(p_exercise->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then raise exception 'Invalid reviewed-exercise teacher intent.' using errcode='23514'; end if;
  request:=jsonb_build_object('settings',p_settings,'exercise',p_exercise);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,0));
  select * into s from public.exam_snapshots where owner_id=actor and request_id=p_request_id;
  if found then
    if s.settings->>'kind' is distinct from 'governed-reviewed-exercise' or s.settings->'request' is distinct from request
      then raise exception 'Retry identity belongs to different paper contents.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
      'settings',p_settings,'exercise',s.structure->'exercise','totalMarks',s.total_marks);
  end if;
  source_group:=(p_exercise->>'id')::uuid; total:=(p_settings->>'totalMarks')::integer;
  captured:=private.reviewed_preset_exercise(source_group);
  if captured is null or captured is distinct from p_exercise then
    raise exception 'Complete published source changed or is unavailable.' using errcode='40001'; end if;
  -- Match publication lock order, including source-bank archive serialization.
  -- Lock the exact reviewed members, not a membership list that can change before the table lock.
  perform r.id from public.preset_curation r where r.question_revision_id in
    (select (m->>'revisionId')::uuid from jsonb_array_elements(captured->'members') m) order by r.id for share of r;
  perform b.id from public.question_banks b join public.questions q on q.bank_id=b.id
    join public.question_revisions v on v.question_id=q.id where v.id in
    (select (m->>'revisionId')::uuid from jsonb_array_elements(captured->'members') m) order by b.id for share of b;
  perform q.id from public.questions q join public.question_revisions v on v.question_id=q.id where v.id in
    (select (m->>'revisionId')::uuid from jsonb_array_elements(captured->'members') m) order by q.id for share of q;
  -- Bounded Phase 13 source pool: table-share locks also stop membership/nested-child phantoms.
  -- Replace with a shared per-group writer protocol only if source-edit concurrency requires it.
  lock table public.question_groups,public.question_group_questions in share mode;
  captured:=private.reviewed_preset_exercise(source_group);
  if captured is null or captured is distinct from p_exercise then
    raise exception 'Complete published source changed or is unavailable.' using errcode='40001'; end if;
  if private.valid_preset_capture_exercise(captured) is distinct from true then
    raise exception 'Complete source does not meet the renderer contract.' using errcode='23514'; end if;
  if total%(captured->>'attemptCount')::integer<>0 then
    raise exception 'Assign equal whole marks to attempted source points.' using errcode='23514'; end if;
  insert into public.exam_snapshots(owner_id,schema_version,selection_seed,settings,structure,total_marks,request_id,document_status)
    values(actor,1,(p_settings->>'selectionSeed')::bigint,
      jsonb_build_object('schemaVersion',1,'kind','governed-reviewed-exercise','request',request),
      jsonb_build_object('schemaVersion',1,'exercise',captured),total,p_request_id,'needs-review') returning * into s;
  for member in select x from jsonb_array_elements(captured->'members') x loop
    position:=position+1;
    insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,publisher_owner_id,position,
      is_locked,structure_path,visible_number,assigned_marks,point_marks,mark_attempt_count)
      select s.id,v.id,actor,v.owner_id,position,true,jsonb_build_array(source_group::text,position::text),position::text,
        scoring.assigned_marks,scoring.point_marks,scoring.mark_attempt_count
      from public.question_revisions v cross join lateral private.preset_exercise_child_scoring(captured,member,total) scoring
      where v.id=(member->>'revisionId')::uuid;
  end loop;
  update public.exam_snapshots set sealed=true where id=s.id returning * into s;
  return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',p_settings,'exercise',captured,'totalMarks',total);
end;
$$;

create function private.get_reviewed_preset_exercise_exam(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  select * into s from public.exam_snapshots where id=p_id and owner_id=auth.uid() and sealed
    and settings->>'kind'='governed-reviewed-exercise';
  if not found then raise exception 'Saved exercise is inaccessible.' using errcode='42501'; end if;
  return jsonb_build_object('id',s.id,'ownerId',s.owner_id,'sealed',s.sealed,'savedAt',s.created_at,
    'settings',s.settings#>'{request,settings}','exercise',s.structure->'exercise','totalMarks',s.total_marks);
end;
$$;
create function public.finalize_reviewed_preset_exercise(p_request_id uuid,p_settings jsonb,p_exercise jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.finalize_reviewed_preset_exercise(p_request_id,p_settings,p_exercise);
$$;
create function public.get_reviewed_preset_exercise_exam(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_reviewed_preset_exercise_exam(p_id);
$$;
revoke all on function private.preset_capture_trim(text),private.preset_capture_text(jsonb),private.preset_capture_text_array(jsonb,integer),
  private.preset_capture_integer(jsonb,integer,bigint),private.valid_preset_capture_payload(jsonb),
  private.valid_preset_capture_settings(jsonb),private.valid_preset_capture_exercise(jsonb),
  private.preset_exercise_child_scoring(jsonb,jsonb,integer),private.check_complete_reviewed_exercise_snapshot(),
  private.finalize_reviewed_preset_exercise(uuid,jsonb,jsonb),public.finalize_reviewed_preset_exercise(uuid,jsonb,jsonb),
  private.get_reviewed_preset_exercise_exam(uuid),public.get_reviewed_preset_exercise_exam(uuid) from public,anon,authenticated;
grant execute on function private.finalize_reviewed_preset_exercise(uuid,jsonb,jsonb),public.finalize_reviewed_preset_exercise(uuid,jsonb,jsonb),
  private.get_reviewed_preset_exercise_exam(uuid),public.get_reviewed_preset_exercise_exam(uuid) to authenticated;

commit;
