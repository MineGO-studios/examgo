-- Restore the Phase 14B validator. Snapshot rollback additions will follow local finalization rehearsal.
begin;

create or replace function private.validate_exam_blueprint_intent(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare b jsonb; branch jsonb; rule jsonb; settings jsonb; field text; entry jsonb;
  question_number integer; previous_number integer:=0; previous_label text;
  slots text[]:='{}'; identities text[]:='{}'; slot text;
  quantity integer; displayed integer; attempted integer; marks integer;
  ordered_ids jsonb; distribution jsonb; point_count integer; point_total integer;
  question_total integer:=0; mark_total integer:=0; printed text[]; printed_count integer;
  uuid_pattern text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>2000000
    or p->'schemaVersion' is distinct from '1'::jsonb or p->>'profileId' is distinct from 'exam-blueprint-v1'
    or p->'rendererVersion' is distinct from '1'::jsonb
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('schemaVersion','profileId','rendererVersion','blueprint','settings','generalInstruction')) then
    raise exception 'Unsupported editable blueprint format.' using errcode='23514';
  end if;
  settings:=p->'settings'; b:=p->'blueprint';
  if jsonb_typeof(settings) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then
    raise exception 'Blueprint and paper details are required.' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_object_keys(b) k where k not in ('schemaVersion','version','ownerId','bankIds','selectionSeed','totalMarks','branches')) then
    raise exception 'Blueprint contains unsupported captured content or settings.' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_object_keys(settings) k where k not in ('schoolName','examTitle','teacherName','grade'))
    or settings->'grade' is distinct from '6'::jsonb then
    raise exception 'Unsupported paper details.' using errcode='23514';
  end if;
  foreach field in array array['schoolName','examTitle','teacherName'] loop
    if jsonb_typeof(settings->field) is distinct from 'string' or length(settings->>field)>80
      or (field<>'teacherName' and length(btrim(settings->>field))=0) then
      raise exception 'Paper details are incomplete or too long.' using errcode='23514';
    end if;
  end loop;
  if jsonb_typeof(p->'generalInstruction') is distinct from 'string' or length(btrim(p->>'generalInstruction'))=0
    or length(p->>'generalInstruction')>1000 or b->'schemaVersion' is distinct from '1'::jsonb
    or not private.blueprint_integer(b->'version',1,2147483647)
    or not private.blueprint_integer(b->'selectionSeed',0,4294967295)
    or not private.blueprint_integer(b->'totalMarks',1,1000)
    or coalesce(b->>'ownerId','') !~ uuid_pattern or jsonb_typeof(b->'bankIds') is distinct from 'array'
    or jsonb_typeof(b->'branches') is distinct from 'array' then
    raise exception 'Blueprint identity, instruction, seed, version or total is invalid.' using errcode='23514';
  end if;
  if jsonb_array_length(b->'bankIds') not between 1 and 20 or jsonb_array_length(b->'branches') not between 1 and 20
    or exists(select 1 from jsonb_array_elements_text(b->'bankIds') e where e !~ uuid_pattern)
    or (select count(distinct e::uuid) from jsonb_array_elements_text(b->'bankIds') e)<>jsonb_array_length(b->'bankIds') then
    raise exception 'Blueprint banks or branches are invalid.' using errcode='23514';
  end if;
  for branch in select value from jsonb_array_elements(b->'branches') loop
    if jsonb_typeof(branch) is distinct from 'object' or jsonb_typeof(branch->'id') is distinct from 'string'
      or length(btrim(branch->>'id')) not between 1 and 80 or branch->>'id'=any(identities)
      or not private.blueprint_integer(branch->'mainQuestionNumber',1,5)
      or branch->'branchLabel' is null or branch->'branchLabel' not in ('null'::jsonb,'"A"'::jsonb,'"B"'::jsonb)
      or coalesce(branch->>'kind','') not in ('questions','passage','matching','completion','alternatives')
      or jsonb_typeof(branch->'instruction') is distinct from 'string' or length(btrim(branch->>'instruction'))=0
      or length(branch->>'instruction')>850 or branch->'arabicInstruction' is null
      or branch->'arabicInstruction'<>'null'::jsonb and (jsonb_typeof(branch->'arabicInstruction')<>'string'
        or length(btrim(branch->>'arabicInstruction'))=0 or length(branch->>'arabicInstruction')>1000)
      or not private.blueprint_integer(branch->'quantity',1,100)
      or not private.blueprint_integer(branch->'displayedPointCount',1,200)
      or not private.blueprint_integer(branch->'marks',1,1000)
      or coalesce(branch#>>'{distribution,mode}','') not in ('equal','custom') then
      raise exception 'Blueprint branch structure, instructions or quantities are invalid.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_object_keys(branch) k where k not in ('id','mainQuestionNumber','branchLabel','kind','instruction','arabicInstruction',
      'questionTypes','quantity','displayedPointCount','answerRule','marks','distribution','units','lessons','difficulties',
      'includedQuestionIds','excludedQuestionIds','lockedQuestionIds','orderedQuestionIds'))
      or jsonb_typeof(branch->'distribution') is distinct from 'object' then
      raise exception 'Branch contains unsupported captured content or settings.' using errcode='23514';
    end if;
    distribution:=branch->'distribution';
    if exists(select 1 from jsonb_object_keys(distribution) k where k<>'mode' and not(k='marksByPoint' and distribution->>'mode'='custom')) then
      raise exception 'Unsupported mark distribution.' using errcode='23514';
    end if;
    question_number:=(branch->>'mainQuestionNumber')::integer;
    slot:=question_number::text||coalesce(branch->>'branchLabel','');
    if slot=any(slots) or not coalesce(question_number>previous_number or question_number=previous_number and previous_label='A' and branch->>'branchLabel'='B',false) then
      raise exception 'Main questions and branches must use distinct Q1-Q5 source order.' using errcode='23514';
    end if;
    slots:=array_append(slots,slot); identities:=array_append(identities,branch->>'id');
    previous_number:=question_number; previous_label:=branch->>'branchLabel';
    foreach field in array array['questionTypes','units','lessons','difficulties','includedQuestionIds','excludedQuestionIds','lockedQuestionIds'] loop
      if jsonb_typeof(branch->field) is distinct from 'array' then
        raise exception 'Blueprint filters and controls must be arrays.' using errcode='23514';
      end if;
      if jsonb_array_length(branch->field)>100 or (select count(distinct e) from jsonb_array_elements(branch->field) e)<>jsonb_array_length(branch->field) then
        raise exception 'Blueprint filters and controls are excessive or repeated.' using errcode='23514';
      end if;
      for entry in select value from jsonb_array_elements(branch->field) loop
        if field='units' then
          if not private.blueprint_integer(entry,1,8) then raise exception 'Invalid blueprint unit.' using errcode='23514'; end if;
        elsif jsonb_typeof(entry) is distinct from 'string' then
          raise exception 'Blueprint filter and control values must be text.' using errcode='23514';
        elsif field='questionTypes' and (entry#>>'{}') not in ('multiple-choice','binary','short-answer','completion','odd-word','matching','word-relationship','rewrite','extended-writing')
          or field='difficulties' and (entry#>>'{}') not in ('easy','medium','hard')
          or field='lessons' and (length(btrim(entry#>>'{}'))=0 or length(entry#>>'{}')>200)
          or field in ('includedQuestionIds','excludedQuestionIds','lockedQuestionIds') and (entry#>>'{}') !~ uuid_pattern then
          raise exception 'Unsupported blueprint filter or control.' using errcode='23514';
        end if;
      end loop;
    end loop;
    if jsonb_array_length(branch->'questionTypes') not between 1 and 9 or jsonb_array_length(branch->'units')>8 or jsonb_array_length(branch->'difficulties')>3
      or exists(select 1 from jsonb_array_elements(branch->'excludedQuestionIds') e
        where branch->'includedQuestionIds' @> jsonb_build_array(e) or branch->'lockedQuestionIds' @> jsonb_build_array(e)) then
      raise exception 'Blueprint filters or include/exclude/lock choices conflict.' using errcode='23514';
    end if;
    ordered_ids:=coalesce(branch->'orderedQuestionIds','[]'::jsonb);
    if jsonb_typeof(ordered_ids) is distinct from 'array' then
      raise exception 'Chosen question order must be an array.' using errcode='23514';
    end if;
    if jsonb_array_length(ordered_ids)>100
      or jsonb_array_length(ordered_ids) not in (0,(branch->>'quantity')::integer)
      or exists(select 1 from jsonb_array_elements(ordered_ids) e where jsonb_typeof(e)<>'string' or (e#>>'{}') !~ uuid_pattern)
      or (select count(distinct e) from jsonb_array_elements(ordered_ids) e)<>jsonb_array_length(ordered_ids)
      or exists(select 1 from jsonb_array_elements(ordered_ids) e where branch->'excludedQuestionIds' @> jsonb_build_array(e)) then
      raise exception 'Chosen order must contain every question once without excluded questions.' using errcode='23514';
    end if;
    quantity:=(branch->>'quantity')::integer; displayed:=(branch->>'displayedPointCount')::integer;
    marks:=(branch->>'marks')::integer; rule:=branch->'answerRule';
    if jsonb_typeof(rule) is distinct from 'object' then raise exception 'An explicit teacher answer rule is required.' using errcode='23514'; end if;
    if exists(select 1 from jsonb_object_keys(rule) k where k<>'kind' and not(k='pointsToAnswer' and rule->>'kind'='points')) then
      raise exception 'Answer rule contains unsupported settings.' using errcode='23514';
    end if;
    if rule->>'kind'='points' and private.blueprint_integer(rule->'pointsToAnswer',1,displayed) then
      attempted:=(rule->>'pointsToAnswer')::integer;
      for printed in select regexp_matches(branch->>'instruction','\manswer\s+(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|all)\M|\m(\d+)\s+only\M','gi') loop
        printed_count:=case lower(coalesce(printed[1],printed[2])) when 'one' then 1 when 'two' then 2 when 'three' then 3 when 'four' then 4 when 'five' then 5
          when 'six' then 6 when 'seven' then 7 when 'eight' then 8 when 'nine' then 9 when 'ten' then 10 when 'all' then displayed else coalesce(printed[1],printed[2])::integer end;
        if printed_count<>attempted then raise exception 'Printed instruction conflicts with Points to answer.' using errcode='23514'; end if;
      end loop;
    elsif rule->>'kind'='task' and branch->>'kind'='questions' and quantity=1 and displayed=1 then attempted:=1;
    elsif rule->>'kind'='choose-one' and branch->>'kind'='alternatives' and quantity=2 and displayed=2 then attempted:=1;
    else raise exception 'Points to answer or writing rule is invalid.' using errcode='23514';
    end if;
    if distribution->>'mode'='custom' then
      if jsonb_typeof(distribution->'marksByPoint') is distinct from 'object' or jsonb_array_length(ordered_ids)<>quantity then
        raise exception 'Custom point marks require the complete chosen question order.' using errcode='23514';
      end if;
      select count(*),coalesce(sum(case when private.blueprint_integer(value,1,1000) then value::text::integer else 0 end),0)
        into point_count,point_total from jsonb_each(distribution->'marksByPoint');
      if point_count<>displayed or exists(select 1 from jsonb_each(distribution->'marksByPoint')
        where length(btrim(key)) not between 1 and 300 or not private.blueprint_integer(value,1,1000)) then
        raise exception 'Assign every displayed point a positive whole mark.' using errcode='23514';
      end if;
      if attempted=displayed then
        if point_total<>marks then raise exception 'Required point marks must total the branch marks.' using errcode='23514'; end if;
      elsif marks%attempted<>0 or exists(select 1 from jsonb_each(distribution->'marksByPoint') where value::text::integer<>marks/attempted) then
        raise exception 'Optional points require equal whole marks.' using errcode='23514';
      end if;
    elsif marks<attempted or marks%attempted<>0 then
      raise exception 'Equal whole point marks are required.' using errcode='23514';
    end if;
    question_total:=question_total+quantity; mark_total:=mark_total+marks;
  end loop;
  if question_total>50 or mark_total<>(b->>'totalMarks')::integer then
    raise exception 'Blueprint quantities exceed 50 or branch marks differ from the paper total.' using errcode='23514';
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid blueprint value.' using errcode='23514';
end;
$$;

create or replace function private.check_complete_exam_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.exam_snapshots%rowtype; child_count integer; canonical_count integer; expected_count integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.workflow is null then return null; end if;
  expected_count := case s.workflow->>'profileId'
    when 'iraqi-phase-nine-source-v1' then 16 when 'exam-002-structural-v1-candidate' then case when s.workflow->'schemaVersion'='2'::jsonb
      and jsonb_array_length(s.workflow#>'{snapshot,branches,5,items}')=6 then 35 else 30 end else null end;
  select count(*),count(distinct r.question_id) into child_count,canonical_count
    from public.exam_snapshot_questions c join public.question_revisions r on r.id=c.question_revision_id where c.snapshot_id=s.id;
  if expected_count is null or not s.sealed or child_count <> expected_count or canonical_count <> expected_count
    or s.source_draft_version is null or s.request_id is null then
    raise exception 'Structured snapshot must be complete and sealed before commit.' using errcode='23514';
  end if;
  if s.workflow->>'profileId'='exam-002-structural-v1-candidate' and s.workflow->'schemaVersion'='2'::jsonb then
    if s.total_marks is distinct from (s.workflow#>>'{snapshot,totalMarks}')::integer
      or s.owner_id::text is distinct from s.workflow->>'ownerId'
      or s.total_marks is distinct from (select sum((branch->>'marks')::integer)
        from jsonb_array_elements(s.workflow#>'{snapshot,branches}') branch)
      or s.structure is distinct from jsonb_build_object('schemaVersion',2,'snapshot',s.workflow->'snapshot')
      or s.settings is distinct from jsonb_build_object('schemaVersion',2,'teacherIntent',s.workflow-'snapshot')
      or exists (
        select 1 from (
          select item->'question' captured_question,(item->'question'->>'id')::uuid canonical_id,
            row_number() over (order by branch_order,item_order) item_position,
            jsonb_build_array(branch->>'id',item->>'label') path,item->>'label' label,
            case when branch->>'kind'='passage' then (branch#>>'{passageGroup,id}')::uuid
              when branch->>'kind'='completion' and branch ? 'completionGroup' then (branch#>>'{completionGroup,id}')::uuid
              else null end source_group_id
          from jsonb_array_elements(s.workflow#>'{snapshot,branches}') with ordinality branches(branch,branch_order),
            lateral jsonb_array_elements(branch->'items') with ordinality items(item,item_order)
        ) expected
        left join public.question_revisions r on r.question_id=expected.canonical_id and r.owner_id=s.owner_id
          and r.revision=(expected.captured_question->>'revision')::integer
        left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=expected.item_position
        left join lateral private.phase_ten_item_scoring(s.workflow,expected.canonical_id) scoring on true
        where c.question_revision_id is distinct from r.id
          or expected.captured_question is distinct from jsonb_build_object(
            'id',r.question_id,'ownerId',r.owner_id,'bankId',r.bank_id,'externalId',r.external_id,
            'unit',r.unit,'lesson',r.lesson,'type',r.question_type,'schemaVersion',r.schema_version,
            'difficulty',r.difficulty,'prompt',r.prompt,'marks',r.marks,'content',r.content,'answer',r.answer,
            'isActive',r.is_active,'revision',r.revision)
          or c.owner_id is distinct from s.owner_id or c.structure_path is distinct from expected.path
          or c.visible_number is distinct from expected.label or c.source_group_id is distinct from expected.source_group_id
          or c.is_locked is distinct from private.phase_ten_item_locked(s.workflow,expected.canonical_id)
          or c.assigned_marks is distinct from scoring.assigned_marks or c.point_marks is distinct from scoring.point_marks
          or c.mark_attempt_count is distinct from scoring.mark_attempt_count) then
      raise exception 'Structured snapshot scoring or revision projection is incomplete.' using errcode='23514';
    end if;
  elsif s.workflow->>'profileId'='iraqi-phase-nine-source-v1' and s.workflow->'schemaVersion'='3'::jsonb then
    if s.total_marks is distinct from (s.workflow#>>'{review,snapshot,totalMarks}')::integer
      or s.schema_version is distinct from 3 or s.owner_id::text is distinct from s.workflow->>'ownerId'
      or s.total_marks is distinct from (select sum((branch->>'marks')::integer)
        from jsonb_array_elements(s.workflow#>'{review,snapshot,structure,branches}') branch)
      or s.structure is distinct from jsonb_build_object('schemaVersion',3,'review',s.workflow->'review')
      or s.settings is distinct from jsonb_build_object('schemaVersion',3,'teacherIntent',s.workflow-'review')
      or exists (
        select 1 from (
          select item->'question' captured_question,(item->'question'->>'id')::uuid canonical_id,
            row_number() over (order by branch_order,item_order) item_position,
            jsonb_build_array(branch->>'id',item->>'visibleLabel') path,item->>'visibleLabel' label
          from jsonb_array_elements(s.workflow#>'{review,snapshot,structure,branches}') with ordinality branches(branch,branch_order),
            lateral jsonb_array_elements(branch->'items') with ordinality items(item,item_order)
        ) expected
        left join public.question_revisions r on r.question_id=expected.canonical_id and r.owner_id=s.owner_id
          and r.revision=(expected.captured_question->>'revision')::integer
        left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=expected.item_position
        left join lateral private.phase_nine_item_scoring(s.workflow,expected.canonical_id) scoring on true
        where c.question_revision_id is distinct from r.id
          or expected.captured_question is distinct from jsonb_build_object(
            'id',r.question_id,'ownerId',r.owner_id,'bankId',r.bank_id,'externalId',r.external_id,
            'unit',r.unit,'lesson',r.lesson,'type',r.question_type,'schemaVersion',r.schema_version,
            'difficulty',r.difficulty,'prompt',r.prompt,'marks',r.marks,'content',r.content,'answer',r.answer,
            'isActive',r.is_active,'revision',r.revision)
          or c.owner_id is distinct from s.owner_id or c.structure_path is distinct from expected.path
          or c.visible_number is distinct from expected.label or c.source_group_id is not null
          or c.is_locked is distinct from ((s.workflow#>'{review,lockedQuestionIds}') ? expected.canonical_id::text)
          or c.assigned_marks is distinct from scoring.assigned_marks or c.point_marks is distinct from scoring.point_marks
          or c.mark_attempt_count is distinct from scoring.mark_attempt_count) then
      raise exception 'Structured snapshot scoring or revision projection is incomplete.' using errcode='23514';
    end if;
  elsif s.total_marks <> 60 then
    raise exception 'Historical structured snapshot total changed.' using errcode='23514';
  end if;
  return null;
end;
$$;
drop function public.get_blueprint_papers(timestamptz,uuid,integer);
drop function public.finalize_blueprint_paper(uuid,uuid,integer,jsonb);
drop function private.finalize_blueprint_paper(uuid,uuid,integer,jsonb);
drop function private.validate_blueprint_paper(jsonb);
drop trigger exam_snapshots_guard_sealed_delete on public.exam_snapshots;
commit;
