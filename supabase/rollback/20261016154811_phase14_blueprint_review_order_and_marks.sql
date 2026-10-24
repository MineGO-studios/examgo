-- Restore the Phase 14A validator. Existing saved configurations remain intact.
-- Ordered/custom configurations remain readable; saving them needs the Phase 14B validator.
begin;

create or replace function private.validate_exam_blueprint_intent(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare b jsonb; branch jsonb; rule jsonb; settings jsonb; field text; entry jsonb;
  question_number integer; previous_number integer:=0; previous_label text;
  slots text[]:='{}'; identities text[]:='{}'; slot text;
  quantity integer; displayed integer; attempted integer; marks integer;
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
      or branch#>>'{distribution,mode}' is distinct from 'equal' then
      raise exception 'Blueprint branch structure, instructions or quantities are invalid.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_object_keys(branch) k where k not in ('id','mainQuestionNumber','branchLabel','kind','instruction','arabicInstruction',
      'questionTypes','quantity','displayedPointCount','answerRule','marks','distribution','units','lessons','difficulties',
      'includedQuestionIds','excludedQuestionIds','lockedQuestionIds'))
      or jsonb_typeof(branch->'distribution') is distinct from 'object' then
      raise exception 'Branch contains unsupported captured content or settings.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_object_keys(branch->'distribution') k where k<>'mode') then
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
    if marks<attempted or marks%attempted<>0 then raise exception 'Equal whole point marks are required.' using errcode='23514'; end if;
    question_total:=question_total+quantity; mark_total:=mark_total+marks;
  end loop;
  if question_total>50 or mark_total<>(b->>'totalMarks')::integer then
    raise exception 'Blueprint quantities exceed 50 or branch marks differ from the paper total.' using errcode='23514';
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid blueprint value.' using errcode='23514';
end;
$$;

commit;
