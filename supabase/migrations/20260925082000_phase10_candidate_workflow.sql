-- Candidate Phase 10 complete-paper persistence. Install on disposable/local
-- environments for review; the profile is not approved for teacher release.
begin;

-- The existing deferred seal gate recognized only the 16-item Phase 9 excerpt.
-- Keep that rule and require 30 distinct revisions for this candidate profile.
create or replace function private.check_complete_exam_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.exam_snapshots%rowtype; child_count integer; canonical_count integer; expected_count integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.workflow is null then return null; end if;
  expected_count := case s.workflow->>'profileId'
    when 'iraqi-phase-nine-source-v1' then 16
    when 'exam-002-structural-v1-candidate' then 30
    else null end;
  select count(*),count(distinct r.question_id) into child_count,canonical_count
    from public.exam_snapshot_questions c join public.question_revisions r on r.id=c.question_revision_id where c.snapshot_id=s.id;
  if expected_count is null or not s.sealed or child_count <> expected_count or canonical_count <> expected_count
    or s.total_marks <> 60 or s.source_draft_version is null or s.request_id is null then
    raise exception 'Structured snapshot must be complete and sealed before commit.' using errcode='23514';
  end if;
  return null;
end;
$$;

-- Existing Phase 9 RPCs share the draft tables. Keep each saved workflow in
-- its original profile and keep the Phase 9 saved-work list source-specific.
create function private.guard_structured_workflow_profile()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.workflow is not null and new.workflow->>'profileId' is distinct from old.workflow->>'profileId' then
    raise exception 'A saved structured draft cannot change profile.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger exam_drafts_guard_workflow_profile before update on public.exam_drafts
  for each row execute function private.guard_structured_workflow_profile();
revoke all on function private.guard_structured_workflow_profile() from public,anon,authenticated;

create or replace function public.get_phase_nine_workflows()
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(rowdata order by saved_at desc),'[]'::jsonb) from (
    select updated_at saved_at,jsonb_build_object('id',id,'version',workflow_version,'finalized',false,'savedAt',updated_at,'workflow',workflow) rowdata
      from public.exam_drafts where owner_id=auth.uid() and workflow->>'profileId'='iraqi-phase-nine-source-v1'
    union all
    select created_at,jsonb_build_object('id',id,'version',1,'finalized',true,'savedAt',created_at,'workflow',workflow)
      from public.exam_snapshots where owner_id=auth.uid() and workflow->>'profileId'='iraqi-phase-nine-source-v1'
  ) records;
$$;

create function private.validate_phase_ten_candidate(p jsonb)
returns table(revision_id uuid, canonical_id uuid, item_position integer, path jsonb, label text, source_group_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  teacher uuid := auth.uid(); bank uuid; b jsonb; item jsonb; q jsonb; spec jsonb; slot jsonb; passage jsonb;
  revision_row public.question_revisions%rowtype; current_row public.questions%rowtype;
  group_row public.question_groups%rowtype;
  branch_index integer := 0; slot_index integer; item_count integer := 0;
  ids uuid[] := '{}'; member_ids uuid[]; captured_ids uuid[];
  profile jsonb := '[
    {"id":"q1a","mainQuestionNumber":1,"branchLabel":"A","kind":"passage","instruction":"Read the passage and answer the questions. (5 only)","arabicInstruction":"اقرأ القطعة الآتية بعناية ثم أجب عن الأسئلة. (خمسة فقط)","marks":5,"attemptCount":5,"slots":[["1","short-answer",1],["2","short-answer",1],["3","short-answer",1],["4","short-answer",1],["5","short-answer",1],["6","short-answer",1]]},
    {"id":"q1b","mainQuestionNumber":1,"branchLabel":"B","kind":"questions","instruction":"Choose the correct answer (5 only)","arabicInstruction":"أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )","marks":5,"attemptCount":5,"slots":[["1","binary",1],["2","short-answer",1],["3","binary",1],["4","binary",1],["5","multiple-choice",1],["6","multiple-choice",1]]},
    {"id":"q2a","mainQuestionNumber":2,"branchLabel":"A","kind":"questions","instruction":"Choose correct word between brackets (5 only)","arabicInstruction":"أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )","marks":10,"attemptCount":5,"slots":[["1","multiple-choice",2],["2","multiple-choice",2],["3","multiple-choice",2],["4","multiple-choice",2],["5","multiple-choice",2],["6","multiple-choice",2]]},
    {"id":"q2b","mainQuestionNumber":2,"branchLabel":"B","kind":"matching","instruction":"Match the question in list ( A ) with their answer in list  ( B )","arabicInstruction":"طابق الجمل","marks":10,"attemptCount":5,"slots":[["Main","matching",10]]},
    {"id":"q3a","mainQuestionNumber":3,"branchLabel":"A","kind":"matching","instruction":"Match Similar words","arabicInstruction":"طابق الكلمات","marks":5,"attemptCount":5,"slots":[["Main","matching",5]]},
    {"id":"q3b","mainQuestionNumber":3,"branchLabel":"B","kind":"completion","instruction":"Choose the correct word between the brackets. (5 only)","arabicInstruction":"أختر الكلمات المناسبة لإكمال الجمل الاتية (5 فقط)","marks":5,"attemptCount":5,"slots":[["1–6","completion",5]]},
    {"id":"q4a","mainQuestionNumber":4,"branchLabel":"A","kind":"questions","instruction":"Rewrite the sentence using capital letters and punctuation marks.","arabicInstruction":"أعد كتابة الجملة الاتية باستخدام الحروف الكبيرة وعلامات التنقيط","marks":5,"attemptCount":1,"slots":[["Main","rewrite",5]]},
    {"id":"q4b","mainQuestionNumber":4,"branchLabel":"B","kind":"questions","instruction":"Fill the blanks with the missing words. (5 only)","arabicInstruction":"أملا الفراغات بالكلمات المفقودة ( 5 فقط )","marks":5,"attemptCount":5,"slots":[["1","word-relationship",1],["2","word-relationship",1],["3","word-relationship",1],["4","word-relationship",1],["5","word-relationship",1],["6","word-relationship",1]]},
    {"id":"q5","mainQuestionNumber":5,"branchLabel":null,"kind":"alternatives","instruction":"Writing (Choose either A or B)","arabicInstruction":"أختر أما A أو B","marks":10,"attemptCount":1,"slots":[["A","extended-writing",10],["B","extended-writing",10]]}
  ]'::jsonb;
begin
  if teacher is null or p->>'ownerId' is distinct from teacher::text then
    raise exception 'Authentication and matching owner are required.' using errcode='42501';
  end if;
  if pg_column_size(p) > 2000000 then raise exception 'Candidate payload is too large.' using errcode='23514'; end if;
  if p->'schemaVersion' is distinct from '1'::jsonb or p->>'profileId' is distinct from 'exam-002-structural-v1-candidate'
    or p->'rendererVersion' is distinct from '1'::jsonb or p->>'generalInstruction' is distinct from 'Answer all questions.'
    or jsonb_typeof(p->'settings') is distinct from 'object' or jsonb_typeof(p->'snapshot') is distinct from 'object'
    or p#>'{snapshot,schemaVersion}' is distinct from '1'::jsonb
    or jsonb_typeof(p#>'{snapshot,branches}') is distinct from 'array'
    or jsonb_array_length(p#>'{snapshot,branches}') <> 9 then
    raise exception 'Unsupported or incomplete candidate envelope.' using errcode='23514';
  end if;
  bank := (p->>'bankId')::uuid;
  if not exists (select 1 from public.question_banks where id=bank and owner_id=teacher and not is_archived) then
    raise exception 'Question bank is not accessible.' using errcode='42501';
  end if;
  if p#>'{snapshot,ownerId}' is distinct from p->'ownerId' or p#>'{snapshot,bankId}' is distinct from p->'bankId'
    or p#>'{snapshot,totalMarks}' is distinct from '60'::jsonb
    or p#>'{settings,grade}' is distinct from '6'::jsonb or p#>'{settings,unit}' is distinct from '1'::jsonb
    or p#>'{settings,questionCount}' is distinct from '30'::jsonb or p#>'{settings,questionQuantities}' is not null
    or p#>'{settings,selectionSeed}' is distinct from p#>'{snapshot,selectionSeed}'
    or coalesce(p#>>'{settings,selectionSeed}','') !~ '^\d+$'
    or (p#>>'{settings,selectionSeed}')::numeric not between 0 and 4294967295
    or coalesce(p#>>'{settings,marksPerQuestion}','') !~ '^([1-9]|1[0-9]|20)$'
    or jsonb_typeof(p#>'{settings,schoolName}') is distinct from 'string'
    or char_length(btrim(p#>>'{settings,schoolName}')) not between 1 and 80
    or jsonb_typeof(p#>'{settings,examTitle}') is distinct from 'string'
    or char_length(btrim(p#>>'{settings,examTitle}')) not between 1 and 80
    or jsonb_typeof(p#>'{settings,teacherName}') is distinct from 'string'
    or char_length(p#>>'{settings,teacherName}') > 80 then
    raise exception 'Candidate settings, count, seed or total are invalid.' using errcode='23514';
  end if;

  for b in select value from jsonb_array_elements(p#>'{snapshot,branches}') loop
    spec := profile->branch_index;
    if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'items') is distinct from 'array'
      or (b - 'items' - 'passageGroup') is distinct from (spec - 'slots')
      or jsonb_array_length(b->'items') <> jsonb_array_length(spec->'slots') then
      raise exception 'Candidate branch topology, instruction or quantity changed.' using errcode='23514';
    end if;
    if branch_index = 0 then
      passage := b->'passageGroup';
      if jsonb_typeof(passage) is distinct from 'object' or passage->>'ownerId' is distinct from teacher::text
        or passage->>'bankId' is distinct from bank::text or passage->'schemaVersion' is distinct from '1'::jsonb
        or passage->>'instruction' is distinct from b->>'instruction'
        or passage->'arabicInstruction' is distinct from b->'arabicInstruction'
        or passage->'attemptCount' is distinct from b->'attemptCount' or passage->'expectedMarks' is distinct from b->'marks'
        or jsonb_typeof(passage->'children') is distinct from 'array'
        or jsonb_array_length(passage->'children') <> 6 then
        raise exception 'Candidate passage does not match its branch.' using errcode='23514';
      end if;
      select * into group_row from public.question_groups where id=(passage->>'id')::uuid and owner_id=teacher for share;
      if not found or group_row.group_type <> 'passage' or group_row.parent_group_id is not null
        or group_row.revision <> (passage->>'revision')::integer or group_row.title is distinct from passage->>'title'
        or group_row.instructions is distinct from passage->>'instruction'
        or group_row.content->>'text' is distinct from passage->>'passage'
        or group_row.content->'arabicInstruction' is distinct from passage->'arabicInstruction'
        or group_row.attempt_count is distinct from (passage->>'attemptCount')::integer
        or group_row.expected_marks is distinct from (passage->>'expectedMarks')::integer then
        raise exception 'Saved passage changed or is inaccessible.' using errcode='40001';
      end if;
      select coalesce(array_agg(question_id order by position),'{}'::uuid[]) into member_ids
        from public.question_group_questions where group_id=group_row.id;
      select coalesce(array_agg((child->'question'->>'id')::uuid order by ordinality),'{}'::uuid[]) into captured_ids
        from jsonb_array_elements(passage->'children') with ordinality children(child,ordinality);
      if member_ids is distinct from captured_ids or group_row.content->'childIds' is distinct from to_jsonb(member_ids)
        or exists (select 1 from jsonb_array_elements(passage->'children') with ordinality children(child,ordinality)
          where child->'position' is distinct from to_jsonb(ordinality) or child->'question' is distinct from (b->'items'->((ordinality-1)::integer)->'question')) then
        raise exception 'Passage membership or child snapshot changed.' using errcode='23514';
      end if;
    elsif b ? 'passageGroup' then
      raise exception 'Only Q1/A can contain a passage group.' using errcode='23514';
    end if;
    slot_index := 0;
    for item in select value from jsonb_array_elements(b->'items') loop
      slot := spec->'slots'->slot_index;
      q := item->'question';
      if jsonb_typeof(q) is distinct from 'object' or item->>'label' is distinct from slot->>0
        or q->>'type' is distinct from slot->>1 or q->'marks' is distinct from slot->2 then
        raise exception 'Candidate question slot or mark changed.' using errcode='23514';
      end if;
      canonical_id := (q->>'id')::uuid;
      if canonical_id = any(ids) then raise exception 'Duplicate canonical question.' using errcode='23514'; end if;
      ids := array_append(ids,canonical_id);
      select * into current_row from public.questions where id=canonical_id and owner_id=teacher;
      if not found or current_row.bank_id <> bank then raise exception 'Question is not accessible.' using errcode='42501'; end if;
      if not current_row.is_active or current_row.current_revision <> (q->>'revision')::integer then
        raise exception 'Question changed or was withdrawn.' using errcode='40001';
      end if;
      select * into revision_row from public.question_revisions
        where question_id=canonical_id and revision=(q->>'revision')::integer and owner_id=teacher;
      if not found then raise exception 'Exact question revision is missing.' using errcode='23514'; end if;
      if q is distinct from jsonb_build_object(
        'id',revision_row.question_id,'ownerId',revision_row.owner_id,'bankId',revision_row.bank_id,
        'externalId',revision_row.external_id,'unit',revision_row.unit,'lesson',revision_row.lesson,
        'type',revision_row.question_type,'schemaVersion',revision_row.schema_version,'difficulty',revision_row.difficulty,
        'prompt',revision_row.prompt,'marks',revision_row.marks,'content',revision_row.content,'answer',revision_row.answer,
        'isActive',revision_row.is_active,'revision',revision_row.revision)
        or revision_row.bank_id <> bank or revision_row.unit <> 1 then
        raise exception 'Captured question differs from its authorized revision.' using errcode='23514';
      end if;
      if b->>'kind' = 'matching' then
        if jsonb_array_length(q#>'{content,left}') <> 5 or jsonb_array_length(q#>'{content,right}') <> 5
          or jsonb_array_length(q#>'{answer,pairs}') <> 5
          or (select count(distinct pair->>'leftId') from jsonb_array_elements(q#>'{answer,pairs}') pair) <> 5
          or (select count(distinct pair->>'rightId') from jsonb_array_elements(q#>'{answer,pairs}') pair) <> 5
          or exists (select 1 from jsonb_array_elements(q#>'{answer,pairs}') pair
            where not exists (select 1 from jsonb_array_elements(q#>'{content,left}') side where side->>'id'=pair->>'leftId')
              or not exists (select 1 from jsonb_array_elements(q#>'{content,right}') side where side->>'id'=pair->>'rightId')) then
          raise exception 'Matching mapping is invalid.' using errcode='23514';
        end if;
      elsif b->>'kind' = 'completion' then
        if jsonb_array_length(q#>'{content,blankIds}') <> 6
          or array_length(regexp_split_to_array(q#>>'{content,text}', E'\r?\n'),1) <> 6
          or (select count(*) from jsonb_object_keys(q#>'{answer,answers}')) <> 6
          or exists (select 1 from jsonb_array_elements_text(q#>'{content,blankIds}') k where not ((q#>'{answer,answers}') ? k.value)) then
          raise exception 'Completion blanks and answers are invalid.' using errcode='23514';
        end if;
      elsif b->>'id' = 'q4a' and q#>>'{content,instruction}' is distinct from b->>'instruction' then
        raise exception 'Rewrite instruction changed.' using errcode='23514';
      end if;
      item_count := item_count + 1;
      revision_id := revision_row.id; item_position := item_count; label := item->>'label';
      path := jsonb_build_array(b->>'id',label);
      source_group_id := case when branch_index=0 then group_row.id else null end;
      return next;
      slot_index := slot_index + 1;
    end loop;
    branch_index := branch_index + 1;
  end loop;
  if item_count <> 30 then raise exception 'Candidate must capture 30 canonical questions.' using errcode='23514'; end if;
end;
$$;

create function private.save_phase_ten_candidate_draft(p_id uuid,p_expected_version integer,p_request_id uuid,p_workflow jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare teacher uuid := auth.uid(); d public.exam_drafts%rowtype; children jsonb;
begin
  if teacher is null or p_id is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Expected version is required.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(teacher::text || ':' || p_id::text,0));
  select * into d from public.exam_drafts where id=p_id for update;
  if found then
    if d.owner_id <> teacher or d.workflow->>'profileId' is distinct from 'exam-002-structural-v1-candidate' then
      raise exception 'Candidate draft is not accessible.' using errcode='42501'; end if;
    if d.workflow_request_id=p_request_id then
      if d.workflow is distinct from p_workflow then raise exception 'Retry identity conflict.' using errcode='23505'; end if;
      return jsonb_build_object('id',d.id,'version',d.workflow_version,'finalized',false,'savedAt',d.updated_at,'workflow',d.workflow);
    end if;
    if d.workflow_version <> p_expected_version then raise exception 'Stale draft version.' using errcode='40001'; end if;
  elsif p_expected_version <> 0 then raise exception 'Draft is missing or stale.' using errcode='40001'; end if;
  perform 1 from public.questions q where q.owner_id=teacher and q.id in (
    select (i->'question'->>'id')::uuid from jsonb_array_elements(p_workflow#>'{snapshot,branches}') b,
      lateral jsonb_array_elements(b->'items') i) order by q.id for share;
  select jsonb_agg(to_jsonb(v)) into children from private.validate_phase_ten_candidate(p_workflow) v;
  if d.id is null then
    insert into public.exam_drafts(id,owner_id,bank_id,exam_title,school_name,grade,unit,marks_per_question,question_count,selection_seed,workflow,workflow_version,workflow_request_id)
    values(p_id,teacher,(p_workflow->>'bankId')::uuid,p_workflow#>>'{settings,examTitle}',p_workflow#>>'{settings,schoolName}',6,1,
      (p_workflow#>>'{settings,marksPerQuestion}')::smallint,30,(p_workflow#>>'{settings,selectionSeed}')::bigint,p_workflow,1,p_request_id)
    returning * into d;
  else
    update public.exam_drafts set bank_id=(p_workflow->>'bankId')::uuid,exam_title=p_workflow#>>'{settings,examTitle}',
      school_name=p_workflow#>>'{settings,schoolName}',marks_per_question=(p_workflow#>>'{settings,marksPerQuestion}')::smallint,
      selection_seed=(p_workflow#>>'{settings,selectionSeed}')::bigint,workflow=p_workflow,
      workflow_version=workflow_version+1,workflow_request_id=p_request_id where id=p_id returning * into d;
    delete from public.exam_draft_questions where exam_draft_id=p_id;
  end if;
  insert into public.exam_draft_questions(exam_draft_id,question_id,position,is_locked)
    select p_id,(x->>'canonical_id')::uuid,(x->>'item_position')::smallint,false from jsonb_array_elements(children) x;
  return jsonb_build_object('id',d.id,'version',d.workflow_version,'finalized',false,'savedAt',d.updated_at,'workflow',d.workflow);
end;
$$;

create function private.finalize_phase_ten_candidate(p_request_id uuid,p_draft_id uuid,p_expected_version integer,p_workflow jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare teacher uuid := auth.uid(); d public.exam_drafts%rowtype; s public.exam_snapshots%rowtype; children jsonb;
begin
  if teacher is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(teacher::text || ':' || p_request_id::text,0));
  select * into s from public.exam_snapshots where owner_id=teacher and request_id=p_request_id;
  if found then
    if s.workflow is distinct from p_workflow or s.source_draft_id is distinct from p_draft_id
      or s.source_draft_version is distinct from p_expected_version then raise exception 'Retry identity conflict.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
  end if;
  select * into d from public.exam_drafts where id=p_draft_id and owner_id=teacher for update;
  if not found or d.workflow->>'profileId' is distinct from 'exam-002-structural-v1-candidate' then
    raise exception 'Candidate draft is not accessible.' using errcode='42501'; end if;
  if d.workflow_version is distinct from p_expected_version or d.workflow is distinct from p_workflow then
    raise exception 'Draft changed before finalization.' using errcode='40001'; end if;
  select * into s from public.exam_snapshots where owner_id=teacher and source_draft_id=p_draft_id and source_draft_version=p_expected_version;
  if found then
    if s.workflow is distinct from p_workflow then raise exception 'Finalized version conflicts with draft.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
  end if;
  perform 1 from public.questions q where q.owner_id=teacher and q.id in (
    select (i->'question'->>'id')::uuid from jsonb_array_elements(p_workflow#>'{snapshot,branches}') b,
      lateral jsonb_array_elements(b->'items') i) order by q.id for share;
  select jsonb_agg(to_jsonb(v)) into children from private.validate_phase_ten_candidate(p_workflow) v;
  insert into public.exam_snapshots(owner_id,source_draft_id,source_draft_version,schema_version,selection_seed,settings,structure,total_marks,document_status,two_page_approved,workflow,request_id)
    values(teacher,p_draft_id,p_expected_version,2,(p_workflow#>>'{settings,selectionSeed}')::bigint,
      jsonb_build_object('schemaVersion',2,'teacherIntent',p_workflow-'snapshot'),
      jsonb_build_object('schemaVersion',2,'snapshot',p_workflow->'snapshot'),60,'needs-review',false,p_workflow,p_request_id)
    returning * into s;
  insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,position,is_locked,source_group_id,structure_path,visible_number)
    select s.id,(x->>'revision_id')::uuid,teacher,(x->>'item_position')::smallint,false,
      nullif(x->>'source_group_id','')::uuid,x->'path',x->>'label' from jsonb_array_elements(children) x;
  update public.exam_snapshots set sealed=true where id=s.id;
  return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
end;
$$;

create function public.save_phase_ten_candidate_draft(p_id uuid,p_expected_version integer,p_request_id uuid,p_workflow jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_phase_ten_candidate_draft(p_id,p_expected_version,p_request_id,p_workflow);
$$;
create function public.finalize_phase_ten_candidate(p_request_id uuid,p_draft_id uuid,p_expected_version integer,p_workflow jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.finalize_phase_ten_candidate(p_request_id,p_draft_id,p_expected_version,p_workflow);
$$;
create function public.get_phase_ten_candidate_workflows()
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(rowdata order by saved_at desc),'[]'::jsonb) from (
    select updated_at saved_at,jsonb_build_object('id',id,'version',workflow_version,'finalized',false,'savedAt',updated_at,'workflow',workflow) rowdata
      from public.exam_drafts where owner_id=auth.uid() and workflow->>'profileId'='exam-002-structural-v1-candidate'
    union all
    select created_at,jsonb_build_object('id',id,'version',1,'finalized',true,'savedAt',created_at,'workflow',workflow)
      from public.exam_snapshots where owner_id=auth.uid() and workflow->>'profileId'='exam-002-structural-v1-candidate'
  ) records;
$$;

revoke all on function private.validate_phase_ten_candidate(jsonb),
  private.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb),private.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb),
  public.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb),public.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb),
  public.get_phase_ten_candidate_workflows() from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb),
  private.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb),
  public.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb),public.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb),
  public.get_phase_ten_candidate_workflows() to authenticated;
commit;
