-- Preserve source instructions in exam-owned scoring without relaxing the fixed candidate topology.
-- CREATE OR REPLACE retains the existing private validator privileges.
begin;
create or replace function private.validate_phase_ten_candidate_v2(p jsonb)
returns table(revision_id uuid, canonical_id uuid, item_position integer, path jsonb, label text, source_group_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  teacher uuid := auth.uid(); bank uuid; b jsonb; item jsonb; q jsonb; spec jsonb; slot jsonb; passage jsonb; controls jsonb;
  revision_row public.question_revisions%rowtype; current_row public.questions%rowtype;
  group_row public.question_groups%rowtype;
  branch_index integer := 0; slot_index integer; item_count integer := 0;
  ids uuid[] := '{}'; member_ids uuid[]; captured_ids uuid[];
  midyear boolean := coalesce(p->'coverageUnits' = '[1,2,3,4]'::jsonb,false);
  covered_units integer[] := '{}';
  banks uuid[]; point_ids text[]; point_id text; point_map jsonb; total integer := 0;
  profile jsonb := '[
    {"id":"q1a","mainQuestionNumber":1,"branchLabel":"A","kind":"passage","instruction":"Read the passage and answer the questions. (5 only)","arabicInstruction":"اقرأ القطعة الآتية بعناية ثم أجب عن الأسئلة. (خمسة فقط)","marks":5,"attemptCount":5,"slots":[["1","short-answer",1],["2","short-answer",1],["3","short-answer",1],["4","short-answer",1],["5","short-answer",1],["6","short-answer",1]]},
    {"id":"q1b","mainQuestionNumber":1,"branchLabel":"B","kind":"questions","instruction":"Choose the correct answer (5 only)","arabicInstruction":"أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )","marks":5,"attemptCount":5,"slots":[["1","binary",1],["2","short-answer",1],["3","binary",1],["4","binary",1],["5","multiple-choice",1],["6","multiple-choice",1]]},
    {"id":"q2a","mainQuestionNumber":2,"branchLabel":"A","kind":"questions","instruction":"Choose correct word between brackets (5 only)","arabicInstruction":"أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )","marks":10,"attemptCount":5,"slots":[["1","multiple-choice",2],["2","multiple-choice",2],["3","multiple-choice",2],["4","multiple-choice",2],["5","multiple-choice",2],["6","multiple-choice",2]]},
    {"id":"q2b","mainQuestionNumber":2,"branchLabel":"B","kind":"matching","instruction":"Match the question in list ( A ) with their answer in list  ( B )","arabicInstruction":"طابق الجمل","marks":10,"attemptCount":5,"slots":[["Main","matching",10]]},
    {"id":"q3a","mainQuestionNumber":3,"branchLabel":"A","kind":"matching","instruction":"Match family members","arabicInstruction":"طابق الكلمات","marks":5,"attemptCount":5,"slots":[["Main","matching",5]]},
    {"id":"q3b","mainQuestionNumber":3,"branchLabel":"B","kind":"completion","instruction":"Choose the correct word between the brackets. (5 only)","arabicInstruction":"أختر الكلمات المناسبة لإكمال الجمل الاتية (5 فقط)","marks":5,"attemptCount":5,"slots":[["1–6","completion",5]]},
    {"id":"q4a","mainQuestionNumber":4,"branchLabel":"A","kind":"questions","instruction":"Rewrite the sentence using capital letters and punctuation marks.","arabicInstruction":"أعد كتابة الجملة الاتية باستخدام الحروف الكبيرة وعلامات التنقيط","marks":5,"attemptCount":1,"slots":[["Main","rewrite",5]]},
    {"id":"q4b","mainQuestionNumber":4,"branchLabel":"B","kind":"questions","instruction":"Fill the blanks with the missing words. (5 only)","arabicInstruction":"أملا الفراغات بالكلمات المفقودة ( 5 فقط )","marks":5,"attemptCount":5,"slots":[["1","word-relationship",1],["2","word-relationship",1],["3","word-relationship",1],["4","word-relationship",1],["5","word-relationship",1],["6","word-relationship",1]]},
    {"id":"q5","mainQuestionNumber":5,"branchLabel":null,"kind":"alternatives","instruction":"Writing (Choose either A or B)","arabicInstruction":"أختر أما A أو B","marks":10,"attemptCount":1,"slots":[["A","extended-writing",10],["B","extended-writing",10]]}
  ]'::jsonb;
begin
  -- Preserve exact readback/finalization of the earlier provisional paper.
  if p#>>'{snapshot,branches,4,instruction}' = 'Match Similar words' then
    profile := jsonb_set(profile, '{4,instruction}', to_jsonb('Match Similar words'::text));
  end if;
  if teacher is null or p->>'ownerId' is distinct from teacher::text then
    raise exception 'Authentication and matching owner are required.' using errcode='42501';
  end if;
  if pg_column_size(p) > 2000000 then raise exception 'Candidate payload is too large.' using errcode='23514'; end if;
  if p ? 'coverageUnits' and not midyear then
    raise exception 'Unsupported mid-year coverage.' using errcode='23514';
  end if;
  if p ? 'selectionControls' and not midyear then
    raise exception 'Selection controls require mid-year coverage.' using errcode='23514';
  end if;
  if p->'schemaVersion' is distinct from '2'::jsonb or p->>'profileId' is distinct from 'exam-002-structural-v1-candidate'
    or p->'rendererVersion' is distinct from '1'::jsonb or p->>'generalInstruction' is distinct from 'Answer all questions.'
    or jsonb_typeof(p->'settings') is distinct from 'object' or jsonb_typeof(p->'snapshot') is distinct from 'object'
    or p#>'{snapshot,schemaVersion}' is distinct from '2'::jsonb
    or jsonb_typeof(p#>'{snapshot,branches}') is distinct from 'array'
    or jsonb_array_length(p#>'{snapshot,branches}') <> 9 then
    raise exception 'Unsupported or incomplete candidate envelope.' using errcode='23514';
  end if;
  bank := (p->>'bankId')::uuid;
  if not exists (select 1 from public.question_banks where id=bank and owner_id=teacher and not is_archived) then
    raise exception 'Question bank is not accessible.' using errcode='42501';
  end if;
  if p#>'{snapshot,ownerId}' is distinct from p->'ownerId' or p#>'{snapshot,bankId}' is distinct from p->'bankId'
    or coalesce(p#>>'{snapshot,totalMarks}','') !~ '^[1-9][0-9]{0,3}$'
    or (p#>>'{snapshot,totalMarks}')::integer > 1000
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

  if jsonb_typeof(p#>'{snapshot,bankIds}') is distinct from 'array'
    or jsonb_array_length(p#>'{snapshot,bankIds}') not between 1 and 20
    or p#>>'{snapshot,bankIds,0}' is distinct from bank::text then
    raise exception 'Selected bank identities are invalid.' using errcode='23514';
  end if;
  select array_agg(value::uuid) into banks from jsonb_array_elements_text(p#>'{snapshot,bankIds}');
  if (select count(distinct id) from unnest(banks) id) <> cardinality(banks) then
    raise exception 'Selected banks must be distinct.' using errcode='23514';
  end if;
  perform 1 from public.question_banks where id=any(banks) order by id for share;
  if (select count(*) from public.question_banks where id=any(banks) and owner_id=teacher and not is_archived)
    <> cardinality(banks) then
    raise exception 'A selected bank is not accessible.' using errcode='42501';
  end if;
  perform 1 from public.question_bank_memberships where bank_id=any(banks)
    and question_id in (select (i->'question'->>'id')::uuid from jsonb_array_elements(p#>'{snapshot,branches}') branch,
      lateral jsonb_array_elements(branch->'items') i) order by bank_id,question_id for share;

  for b in select value from jsonb_array_elements(p#>'{snapshot,branches}') loop
    spec := profile->branch_index;
    if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'items') is distinct from 'array'
      or (case when branch_index=0 or b->>'kind' in ('matching','completion') or b->>'id'='q4a' then b-'items'-'passageGroup'-'pointMarks'-'marks'-'instruction'-'arabicInstruction'
        else b-'items'-'passageGroup'-'pointMarks'-'marks' end) is distinct from
        (case when branch_index=0 or b->>'kind' in ('matching','completion') or b->>'id'='q4a' then spec-'slots'-'marks'-'instruction'-'arabicInstruction' else spec-'slots'-'marks' end)
      or coalesce(b->>'marks','') !~ '^[1-9][0-9]{0,3}$' or (b->>'marks')::integer > 1000
      or jsonb_typeof(b->'pointMarks') is distinct from 'object'
      or jsonb_array_length(b->'items') <> jsonb_array_length(spec->'slots') then
      raise exception 'Candidate branch topology, instruction or quantity changed.' using errcode='23514';
    end if;
    point_ids := '{}'; point_map := b->'pointMarks';
    if branch_index = 0 then
      passage := b->'passageGroup';
      if jsonb_typeof(passage) is distinct from 'object' or passage->>'ownerId' is distinct from teacher::text
        or not (passage ?& array['id','ownerId','bankId','revision','schemaVersion','title','instruction',
          'arabicInstruction','passage','attemptCount','expectedMarks','children'])
        or passage->'schemaVersion' is distinct from '1'::jsonb
        or passage->>'instruction' is distinct from b->>'instruction'
        or passage->'arabicInstruction' is distinct from b->'arabicInstruction'
        or passage->'attemptCount' is distinct from b->'attemptCount'
        or jsonb_typeof(passage->'children') is distinct from 'array'
        or jsonb_array_length(passage->'children') <> 6 then
        raise exception 'Candidate passage does not match its branch.' using errcode='23514';
      end if;
      select * into group_row from public.question_groups where id=(passage->>'id')::uuid and owner_id=teacher for share;
      if not found or group_row.group_type <> 'passage' or group_row.parent_group_id is not null
        or group_row.revision <> (passage->>'revision')::integer or group_row.title is distinct from passage->>'title'
        or group_row.instructions is distinct from passage->>'instruction'
        or group_row.content->>'bankId' is distinct from passage->>'bankId'
        or group_row.content->>'text' is distinct from passage->>'passage'
        or group_row.content->'arabicInstruction' is distinct from passage->'arabicInstruction'
        or group_row.attempt_count is distinct from (passage->>'attemptCount')::integer
        or group_row.expected_marks is distinct from (passage->>'expectedMarks')::integer then
        raise exception 'Saved passage changed or is inaccessible.' using errcode='40001';
      end if;
      if passage-'children' is distinct from jsonb_build_object(
        'id',group_row.id,'ownerId',group_row.owner_id,'bankId',group_row.content->>'bankId',
        'revision',group_row.revision,'schemaVersion',group_row.schema_version,'title',group_row.title,
        'instruction',group_row.instructions,'arabicInstruction',group_row.content->'arabicInstruction',
        'passage',group_row.content->>'text','attemptCount',group_row.attempt_count,'expectedMarks',group_row.expected_marks) then
        raise exception 'Captured passage differs from its exact source metadata.' using errcode='23514';
      end if;
      select coalesce(array_agg(question_id order by position),'{}'::uuid[]) into member_ids
        from public.question_group_questions where group_id=group_row.id;
      select coalesce(array_agg((child->'question'->>'id')::uuid order by ordinality),'{}'::uuid[]) into captured_ids
        from jsonb_array_elements(passage->'children') with ordinality children(child,ordinality);
      if member_ids is distinct from captured_ids or group_row.content->'childIds' is distinct from to_jsonb(member_ids)
        or exists (select 1 from jsonb_array_elements(passage->'children') with ordinality children(child,ordinality)
          where child is distinct from jsonb_build_object('position',ordinality,
            'question',b->'items'->((ordinality-1)::integer)->'question')) then
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
        or q->>'type' is distinct from slot->>1 then
        raise exception 'Candidate question slot or mark changed.' using errcode='23514';
      end if;
      canonical_id := (q->>'id')::uuid;
      if canonical_id = any(ids) then raise exception 'Duplicate canonical question.' using errcode='23514'; end if;
      ids := array_append(ids,canonical_id);
      select * into current_row from public.questions where id=canonical_id and owner_id=teacher;
      if not found or not exists (select 1 from public.question_bank_memberships m
        where m.question_id=canonical_id and m.bank_id=any(banks) and m.owner_id=teacher) then
        raise exception 'Question is outside the selected accessible collections.' using errcode='42501';
      end if;
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
        or (not midyear and revision_row.unit <> (p#>>'{settings,unit}')::integer)
        or (midyear and revision_row.unit not between 1 and 4) then
        raise exception 'Captured question differs from its authorized revision.' using errcode='23514';
      end if;
      covered_units := array_append(covered_units, revision_row.unit);
      if b->>'kind' in ('matching','completion') or b->>'id'='q4a' then
        if not (b ?& array['instruction','arabicInstruction'])
          or jsonb_typeof(b->'instruction') is distinct from 'string'
          or char_length(b->>'instruction') not between 1 and 1000
          or (b->'arabicInstruction' is distinct from 'null'::jsonb
            and b->'arabicInstruction' is distinct from spec->'arabicInstruction')
          or (b->>'kind' in ('matching','completion')
            and b->>'instruction' is distinct from spec->>'instruction'
            and b->>'instruction' is distinct from q->>'prompt') then
          raise exception 'Question branch instruction differs from its captured source.' using errcode='23514';
        end if;
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
      if b->>'kind' = 'passage' then
        point_ids := array_append(point_ids,(passage->>'id')||':child:'||canonical_id::text);
      elsif q->>'type' = 'completion' then
        for point_id in select value from jsonb_array_elements_text(q#>'{content,blankIds}') loop
          point_ids := array_append(point_ids,canonical_id::text||':blank:'||point_id);
        end loop;
      elsif q->>'type' = 'matching' then
        for point_id in select value->>'id' from jsonb_array_elements(q#>'{content,left}') loop
          point_ids := array_append(point_ids,canonical_id::text||':pair:'||point_id);
        end loop;
      else point_ids := array_append(point_ids,canonical_id::text); end if;
      item_count := item_count + 1;
      revision_id := revision_row.id; item_position := item_count; label := item->>'label';
      path := jsonb_build_array(b->>'id',label);
      source_group_id := case when branch_index=0 then group_row.id else null end;
      return next;
      slot_index := slot_index + 1;
    end loop;
    if (select count(*) from jsonb_object_keys(point_map)) <> cardinality(point_ids)
      or not (point_map ?& point_ids)
      or not public.valid_attempt_exam_point_marks((b->>'marks')::smallint,point_map,(b->>'attemptCount')::smallint) then
      raise exception 'Teacher point marks or attempted branch total are invalid.' using errcode='23514';
    end if;
    total := total + (b->>'marks')::integer;
    branch_index := branch_index + 1;
  end loop;
  if total <> (p#>>'{snapshot,totalMarks}')::integer then
    raise exception 'Exam total differs from teacher branch totals.' using errcode='23514';
  end if;
  if item_count <> 30 then raise exception 'Candidate must capture 30 canonical questions.' using errcode='23514'; end if;
  if midyear and not (covered_units @> ARRAY[1,2,3,4]) then
    raise exception 'A mid-year paper must cover every Unit 1-4.' using errcode='23514';
  end if;
  if midyear and p ? 'selectionControls' then
    controls := p->'selectionControls';
    if jsonb_typeof(controls) is distinct from 'object'
      or (controls ? 'excludedQuestionIds' and jsonb_typeof(controls->'excludedQuestionIds') is distinct from 'array')
      or (controls ? 'excludedPassageGroupIds' and jsonb_typeof(controls->'excludedPassageGroupIds') is distinct from 'array')
      or (controls ? 'lockedQuestionIds' and jsonb_typeof(controls->'lockedQuestionIds') is distinct from 'object')
      or (controls ? 'lockedPassageGroupId' and jsonb_typeof(controls->'lockedPassageGroupId') is distinct from 'string') then
      raise exception 'Malformed selection controls.' using errcode='23514';
    end if;
    if controls ? 'lockedPassageGroupId' and controls->>'lockedPassageGroupId' is distinct from
      p#>>'{snapshot,branches,0,passageGroup,id}' then
      raise exception 'Locked passage differs from the captured group.' using errcode='23514';
    end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(controls->'excludedQuestionIds','[]'::jsonb)) excluded(id)
        join unnest(ids) selected(id) on excluded.id=selected.id::text)
      or exists (select 1 from jsonb_array_elements_text(coalesce(controls->'excludedPassageGroupIds','[]'::jsonb)) excluded(id)
        where excluded.id=p#>>'{snapshot,branches,0,passageGroup,id}')
      or exists (select 1 from jsonb_each_text(coalesce(controls->'lockedQuestionIds','{}'::jsonb)) lock(slot_key,question_id)
        where not exists (select 1 from jsonb_array_elements(p#>'{snapshot,branches}') branch,
          lateral jsonb_array_elements(branch->'items') candidate_item
          where branch->>'id' <> 'q1a' and (branch->>'id')||':'||(candidate_item->>'label')=lock.slot_key
            and candidate_item->'question'->>'id'=lock.question_id)) then
      raise exception 'Selection controls differ from captured questions.' using errcode='23514';
    end if;
  end if;
end;
$$;
commit;
