-- Business conflicts must return HTTP 409, not PostgREST serialization retries.
-- Keep the original installed migration immutable; preserve signatures and privileges.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
begin;
create or replace function private.validate_phase_nine_workflow(p jsonb)
returns table(revision_id uuid, canonical_id uuid, item_position integer, locked boolean, path jsonb, label text)
language plpgsql security definer set search_path = '' as $$
declare
  teacher uuid := auth.uid();
  bank uuid;
  b jsonb; item jsonb; q jsonb; expected jsonb;
  revision_row public.question_revisions%rowtype;
  current_row public.questions%rowtype;
  branch_index integer := 0; item_index integer; item_count integer := 0;
  ids uuid[] := '{}'; expected_counts integer[] := array[1,6,6,1,2];
  expected_marks integer[] := array[10,2,2,10,20];
  profile jsonb := '[
    {"id":"q3a","mainQuestionNumber":3,"branchLabel":"A","kind":"completion","instruction":"Use the words in the box to complete the sentences.","arabicInstruction":"استخدم الكلمات بين الاقواس لاكمال الجمل","marks":10,"attemptCount":5,"layout":"vertical"},
    {"id":"q3b","mainQuestionNumber":3,"branchLabel":"B","kind":"odd-word","instruction":"B-Write the odd word. (5 only)","arabicInstruction":"اكتب الكلمة المختلفة. (خمس فقط)","marks":10,"attemptCount":5,"layout":"vertical"},
    {"id":"q4a","mainQuestionNumber":4,"branchLabel":"A","kind":"word-relationship","instruction":"Fill the blanks with the missing words. (5 only).","arabicInstruction":"املأ الفراغات بالكلمات المفقودة. (خمس فقط)","marks":10,"attemptCount":5,"layout":"source-two-column"},
    {"id":"q4b","mainQuestionNumber":4,"branchLabel":"B","kind":"rewrite","instruction":"Rewrite the sentence using capital letters and punctuation marks.","arabicInstruction":"أعد كتابة الجملة الآتية باستخدام الحروف الكبيرة وعلامات التنقيط.","marks":10,"attemptCount":1,"layout":"vertical"},
    {"id":"q5","mainQuestionNumber":5,"branchLabel":null,"kind":"writing-alternatives","instruction":"Writing (Choose either A or B)","arabicInstruction":"اختر إما A أو B.","marks":20,"attemptCount":1,"layout":"writing-alternatives"}
  ]'::jsonb;
begin
  if teacher is null or p->>'ownerId' is distinct from teacher::text then
    raise exception 'Authentication and matching owner are required.' using errcode = '42501';
  end if;
  if pg_column_size(p) > 2000000 then raise exception 'Workflow payload is too large.' using errcode='23514'; end if;
  if p->'schemaVersion' is distinct from '2'::jsonb
    or p->>'profileId' is distinct from 'iraqi-phase-nine-source-v1'
    or p->'rendererVersion' is distinct from '1'::jsonb
    or p#>'{review,snapshot,schemaVersion}' is distinct from '1'::jsonb
    or p#>'{review,snapshot,structure,schemaVersion}' is distinct from '1'::jsonb
    or p->>'generalInstruction' is distinct from 'Note: Answer all the questions.'
    or jsonb_typeof(p->'settings') is distinct from 'object'
    or jsonb_typeof(p->'filters') is distinct from 'object'
    or jsonb_typeof(p#>'{review,lockedQuestionIds}') is distinct from 'array'
    or jsonb_typeof(p#>'{review,snapshot,structure,branches}') is distinct from 'array' then
    raise exception 'Unsupported or incomplete workflow envelope.' using errcode = '23514';
  end if;
  bank := (p->>'bankId')::uuid;
  if not exists (select 1 from public.question_banks where id = bank and owner_id = teacher) then
    raise exception 'Question bank is not accessible.' using errcode = '42501';
  end if;
  if p#>'{settings,grade}' is distinct from '6'::jsonb or p#>'{settings,unit}' is distinct from '1'::jsonb
    or p#>'{settings,questionCount}' is distinct from '16'::jsonb
    or p#>'{settings,questionQuantities}' is not null
    or p#>'{review,snapshot,totalMarks}' is distinct from '60'::jsonb
    or p#>'{settings,selectionSeed}' is distinct from p#>'{review,snapshot,selectionSeed}'
    or coalesce(p#>>'{settings,selectionSeed}', '') !~ '^\d+$'
    or (p#>>'{settings,selectionSeed}')::numeric not between 0 and 4294967295
    or coalesce(p->>'pageTarget', '') !~ '^[1-5]$'
    or coalesce(p#>>'{settings,marksPerQuestion}', '') !~ '^([1-9]|1[0-9]|20)$'
    or jsonb_typeof(p#>'{settings,schoolName}') is distinct from 'string'
    or char_length(btrim(p#>>'{settings,schoolName}')) not between 1 and 80
    or jsonb_typeof(p#>'{settings,examTitle}') is distinct from 'string'
    or char_length(btrim(p#>>'{settings,examTitle}')) not between 1 and 80
    or jsonb_typeof(p#>'{settings,teacherName}') is distinct from 'string'
    or char_length(p#>>'{settings,teacherName}') > 80
    or jsonb_typeof(p#>'{filters,lesson}') is distinct from 'string'
    or char_length(p#>>'{filters,lesson}') > 40
    or coalesce(p#>>'{filters,difficulty}', 'invalid') not in ('','easy','medium','hard')
    or jsonb_array_length(p#>'{review,snapshot,structure,branches}') <> 5 then
    raise exception 'Teacher intent, counts, marks or source profile are inconsistent.' using errcode = '23514';
  end if;
  for b in select value from jsonb_array_elements(p#>'{review,snapshot,structure,branches}') loop
    expected := profile->branch_index;
    if jsonb_typeof(b) is distinct from 'object' or not (b @> expected)
      or jsonb_typeof(b->'items') is distinct from 'array' then
      raise exception 'Invalid source branch.' using errcode = '23514';
    end if;
    branch_index := branch_index + 1;
    if jsonb_array_length(b->'items') <> expected_counts[branch_index] then
      raise exception 'Source branch quantity mismatch.' using errcode = '23514';
    end if;
    item_index := 0;
    for item in select value from jsonb_array_elements(b->'items') loop
      item_index := item_index + 1; item_count := item_count + 1;
      q := item->'question';
      label := case branch_index when 1 then '1–5' when 4 then 'Main' when 5 then case item_index when 1 then 'A' else 'B' end else item_index::text end;
      if item->>'visibleLabel' is distinct from label or item ? 'arabicPrompt' then
        raise exception 'Source labels or translations disagree with the stored revision contract.' using errcode = '23514';
      end if;
      canonical_id := (q->>'id')::uuid;
      if canonical_id = any(ids) then raise exception 'Duplicate canonical question.' using errcode = '23514'; end if;
      ids := array_append(ids, canonical_id);
      -- Lock source rows in canonical order in the caller before this validation.
      select * into current_row from public.questions where id = canonical_id and owner_id = teacher;
      if not found or current_row.bank_id <> bank then raise exception 'Question is not accessible.' using errcode = '42501'; end if;
      if not current_row.is_active or current_row.current_revision <> (q->>'revision')::integer then
        raise exception 'A selected question changed or was withdrawn.' using errcode = 'PT409';
      end if;
      select * into revision_row from public.question_revisions
        where question_id = canonical_id and revision = (q->>'revision')::integer and owner_id = teacher;
      if not found then raise exception 'Exact question revision is missing.' using errcode = '23514'; end if;
      if q is distinct from jsonb_build_object(
        'id',revision_row.question_id,'ownerId',revision_row.owner_id,'bankId',revision_row.bank_id,
        'externalId',revision_row.external_id,'unit',revision_row.unit,'lesson',revision_row.lesson,
        'type',revision_row.question_type,'schemaVersion',revision_row.schema_version,'difficulty',revision_row.difficulty,
        'prompt',revision_row.prompt,'marks',revision_row.marks,'content',revision_row.content,'answer',revision_row.answer,
        'isActive',revision_row.is_active,'revision',revision_row.revision)
        or revision_row.unit <> 1 or revision_row.marks <> expected_marks[branch_index]
        or revision_row.question_type <> (case when b->>'kind' = 'writing-alternatives' then 'extended-writing' else b->>'kind' end)
        or (p#>>'{filters,lesson}' <> '' and revision_row.lesson <> p#>>'{filters,lesson}')
        or (p#>>'{filters,difficulty}' <> '' and revision_row.difficulty <> p#>>'{filters,difficulty}') then
        raise exception 'Captured question differs from its exact authorized revision or configuration.' using errcode = '23514';
      end if;
      if branch_index = 1 then
        if jsonb_array_length(q#>'{content,blankIds}') is distinct from 5
          or array_length(regexp_split_to_array(q#>>'{content,text}', E'\r?\n'),1) is distinct from 5
          or jsonb_typeof(q#>'{answer,answers}') is distinct from 'object'
          or (select count(*) from jsonb_object_keys(q#>'{answer,answers}')) <> 5
          or (select count(distinct value) from jsonb_array_elements_text(q#>'{content,blankIds}')) <> 5
          or exists (select 1 from jsonb_array_elements_text(q#>'{content,blankIds}') k where not ((q#>'{answer,answers}') ? k.value))
          or exists (select 1 from unnest(regexp_split_to_array(q#>>'{content,text}', E'\r?\n')) line
            where (select count(*) from regexp_matches(line, '\.{3,}|_{3,}|…+', 'g')) <> 1) then
          raise exception 'Completion display and answer identities disagree.' using errcode = '23514';
        end if;
        if not exists (select 1 from jsonb_array_elements_text(q#>'{content,blankIds}') k where k.value !~ '^blank-\d+$')
          and exists (select 1 from jsonb_array_elements_text(q#>'{content,blankIds}') with ordinality k(value,n) where k.value <> 'blank-' || k.n::text) then
          raise exception 'Completion blank positions disagree.' using errcode = '23514';
        end if;
      end if;
      if branch_index = 4 and q#>>'{content,instruction}' is distinct from b->>'instruction' then
        raise exception 'Rewrite instruction mismatch.' using errcode = '23514';
      end if;
      revision_id := revision_row.id; item_position := item_count;
      locked := (p#>'{review,lockedQuestionIds}') ? canonical_id::text;
      path := jsonb_build_array(b->>'id', label);
      return next;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements_text(p#>'{review,lockedQuestionIds}')) <>
    (select count(distinct value) from jsonb_array_elements_text(p#>'{review,lockedQuestionIds}'))
    or exists (select 1 from jsonb_array_elements_text(p#>'{review,lockedQuestionIds}') k where not (k.value::uuid = any(ids))) then
    raise exception 'Invalid saved locks.' using errcode = '23514';
  end if;
end;
$$;

create or replace function private.save_phase_nine_draft(p_id uuid, p_expected_version integer, p_request_id uuid, p_workflow jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare teacher uuid := auth.uid(); d public.exam_drafts%rowtype; children jsonb;
begin
  if teacher is null or p_id is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Expected draft version is required.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(teacher::text || ':' || p_id::text,0));
  select * into d from public.exam_drafts where id=p_id for update;
  if found then
    if d.owner_id <> teacher or d.workflow is null then raise exception 'Structured draft is not accessible.' using errcode='42501'; end if;
    if d.workflow_request_id=p_request_id then
      if d.workflow is distinct from p_workflow then raise exception 'Retry identity conflict.' using errcode='23505'; end if;
      return jsonb_build_object('id',d.id,'version',d.workflow_version,'finalized',false,'savedAt',d.updated_at,'workflow',d.workflow);
    end if;
    if d.workflow_version <> p_expected_version then raise exception 'Stale draft version.' using errcode='PT409'; end if;
  elsif p_expected_version is distinct from 0 then raise exception 'Draft is missing or stale.' using errcode='PT409';
  end if;
  perform 1 from public.questions q where q.owner_id=teacher and q.id in (
    select (i->'question'->>'id')::uuid from jsonb_array_elements(p_workflow#>'{review,snapshot,structure,branches}') b,
    lateral jsonb_array_elements(b->'items') i) order by q.id for share;
  select jsonb_agg(to_jsonb(v)) into children from private.validate_phase_nine_workflow(p_workflow) v;
  if d.id is null then
    insert into public.exam_drafts(id,owner_id,bank_id,exam_title,school_name,grade,unit,marks_per_question,question_count,selection_seed,workflow,workflow_version,workflow_request_id)
    values(p_id,teacher,(p_workflow->>'bankId')::uuid,p_workflow#>>'{settings,examTitle}',p_workflow#>>'{settings,schoolName}',6,1,
      (p_workflow#>>'{settings,marksPerQuestion}')::smallint,16,(p_workflow#>>'{settings,selectionSeed}')::bigint,p_workflow,1,p_request_id) returning * into d;
  else
    update public.exam_drafts set bank_id=(p_workflow->>'bankId')::uuid,exam_title=p_workflow#>>'{settings,examTitle}',school_name=p_workflow#>>'{settings,schoolName}',
      marks_per_question=(p_workflow#>>'{settings,marksPerQuestion}')::smallint,selection_seed=(p_workflow#>>'{settings,selectionSeed}')::bigint,
      workflow=p_workflow,workflow_version=workflow_version+1,workflow_request_id=p_request_id where id=p_id returning * into d;
    delete from public.exam_draft_questions where exam_draft_id=p_id;
  end if;
  insert into public.exam_draft_questions(exam_draft_id,question_id,position,is_locked)
    select p_id,(x->>'canonical_id')::uuid,(x->>'item_position')::smallint,(x->>'locked')::boolean from jsonb_array_elements(children) x;
  return jsonb_build_object('id',d.id,'version',d.workflow_version,'finalized',false,'savedAt',d.updated_at,'workflow',d.workflow);
end;
$$;

create or replace function private.finalize_phase_nine_exam(p_request_id uuid,p_draft_id uuid,p_expected_version integer,p_workflow jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if not found then raise exception 'Draft is not accessible.' using errcode='42501'; end if;
  if d.workflow_version is distinct from p_expected_version or d.workflow is distinct from p_workflow then raise exception 'Draft changed before finalization.' using errcode='PT409'; end if;
  -- Different clients finalizing the same reviewed draft version also converge.
  select * into s from public.exam_snapshots where owner_id=teacher and source_draft_id=p_draft_id and source_draft_version=p_expected_version;
  if found then
    if s.workflow is distinct from p_workflow then raise exception 'Finalized version conflicts with the draft.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
  end if;
  perform 1 from public.questions q where q.owner_id=teacher and q.id in (
    select (i->'question'->>'id')::uuid from jsonb_array_elements(p_workflow#>'{review,snapshot,structure,branches}') b,
    lateral jsonb_array_elements(b->'items') i) order by q.id for share;
  select jsonb_agg(to_jsonb(v)) into children from private.validate_phase_nine_workflow(p_workflow) v;
  insert into public.exam_snapshots(owner_id,source_draft_id,source_draft_version,schema_version,selection_seed,settings,structure,total_marks,document_status,two_page_approved,workflow,request_id)
    values(teacher,p_draft_id,p_expected_version,2,(p_workflow#>>'{settings,selectionSeed}')::bigint,
      jsonb_build_object('schemaVersion',2,'teacherIntent',p_workflow-'review'),jsonb_build_object('schemaVersion',2,'review',p_workflow->'review'),60,'needs-review',false,p_workflow,p_request_id)
    returning * into s;
  insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,position,is_locked,structure_path,visible_number)
    select s.id,(x->>'revision_id')::uuid,teacher,(x->>'item_position')::smallint,(x->>'locked')::boolean,x->'path',x->>'label' from jsonb_array_elements(children) x;
  update public.exam_snapshots set sealed=true where id=s.id;
  return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
end;
$$;
commit;
