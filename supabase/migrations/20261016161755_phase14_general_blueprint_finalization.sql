-- Local development work in progress. Connected installation requires separate approval.
begin;

create or replace function private.validate_exam_blueprint_intent(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare b jsonb; branch jsonb; rule jsonb; settings jsonb; field text; entry jsonb;
  question_number integer; previous_number integer:=0; previous_label text;
  slots text[]:='{}'; identities text[]:='{}'; slot text;
  quantity integer; displayed integer; attempted integer; marks integer;
  ordered_ids jsonb; distribution jsonb; reviewed jsonb; arabic_text text; arabic_matches text[]; count_token text; point_count integer; point_total integer;
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
      'includedQuestionIds','excludedQuestionIds','lockedQuestionIds','orderedQuestionIds','reviewedQuestionRevisions','reviewedGroup'))
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
    if branch ? 'reviewedQuestionRevisions' then
      reviewed:=branch->'reviewedQuestionRevisions';
      if jsonb_typeof(reviewed) is distinct from 'object' then
        raise exception 'Reviewed versions must be an object.' using errcode='23514';
      end if;
      if jsonb_array_length(ordered_ids)<>(branch->>'quantity')::integer
        or (select count(*) from jsonb_each(reviewed))<>(branch->>'quantity')::integer
        or exists(select 1 from jsonb_each(reviewed) where not(ordered_ids @> jsonb_build_array(key)) or not private.blueprint_integer(value,1,2147483647)) then
        raise exception 'Reviewed versions must match the complete chosen order.' using errcode='23514';
      end if;
    end if;
    if branch ? 'reviewedGroup' then
      reviewed:=branch->'reviewedGroup';
      if jsonb_typeof(reviewed) is distinct from 'object' then raise exception 'Invalid reviewed group.' using errcode='23514'; end if;
      if not(branch ? 'reviewedQuestionRevisions') or coalesce(reviewed->>'id','') !~ uuid_pattern
        or not private.blueprint_integer(reviewed->'revision',1,2147483647)
        or (select count(*) from jsonb_object_keys(reviewed))<>2
        or not(branch->>'kind'='passage' or branch->>'kind'='completion' and (branch->>'quantity')::integer>1) then
        raise exception 'Reviewed group versions require a complete passage or completion exercise.' using errcode='23514';
      end if;
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
      arabic_text:=translate(regexp_replace(coalesce(branch->>'arabicInstruction',''),'[ً-ٰٟ]','','g'),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
      for arabic_matches in select regexp_matches(arabic_text,'(?:^|[\s(])((?:[0-9]+|واحد|واحدة|اثنان|اثنين|اثنتان|اثنتين|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|عشر))\s*فقط(?=$|[\s).،])|(?:أجب|اجب)\s+(?:عن\s+)?\(?((?:[0-9]+|واحد|واحدة|اثنان|اثنين|اثنتان|اثنتين|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع|عشرة|عشر))(?=$|[\s).،])','g') loop
        count_token:=coalesce(arabic_matches[1],arabic_matches[2]);
        printed_count:=coalesce(('{"واحد":1,"واحدة":1,"اثنان":2,"اثنين":2,"اثنتان":2,"اثنتين":2,"ثلاثة":3,"ثلاث":3,"أربعة":4,"اربعة":4,"أربع":4,"اربع":4,"خمسة":5,"خمس":5,"ستة":6,"ست":6,"سبعة":7,"سبع":7,"ثمانية":8,"ثمان":8,"تسعة":9,"تسع":9,"عشرة":10,"عشر":10}'::jsonb->>count_token)::integer,count_token::integer);
        if printed_count<>attempted then raise exception 'Arabic instruction conflicts with Points to answer.' using errcode='23514'; end if;
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

create function private.validate_blueprint_paper(p jsonb)
returns table(revision_id uuid,canonical_id uuid,item_position integer,path jsonb,label text,source_group_id uuid,
  is_locked boolean,assigned_marks smallint,point_marks jsonb,mark_attempt_count smallint)
language plpgsql security invoker set search_path='' as $$
declare teacher uuid:=auth.uid(); plan jsonb; captured jsonb; branch jsonb; spec jsonb; item jsonb; q jsonb; context jsonb;
  banks uuid[]; selected_ids uuid[]; branch_ids uuid[]; member_ids uuid[]; seen uuid[]:='{}';
  question_row public.questions%rowtype; revision_row public.question_revisions%rowtype; group_row public.question_groups%rowtype;
  branch_index integer:=0; item_index integer; position integer:=0; attempted integer; points text[]; item_points text[]; point_id text;
  expected_instruction text; expected_label text; point_map jsonb; group_id uuid;
begin
  if teacher is null then raise exception 'Sign in to generate a paper.' using errcode='42501'; end if;
  if p is null or jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>2000000
    or p->'schemaVersion' is distinct from '1'::jsonb or p->>'profileId' is distinct from 'exam-blueprint-paper-v1'
    or p->'rendererVersion' is distinct from '1'::jsonb
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('schemaVersion','profileId','rendererVersion','intent','snapshot','layout'))
    or p->'layout' not in ('{"schemaVersion":1,"status":"NEEDS_REVIEW","estimateVersion":1,"decision":"review-required"}'::jsonb,
      '{"schemaVersion":1,"status":"NEEDS_REVIEW","estimateVersion":1,"decision":"unchanged-two-page"}'::jsonb)
    or p->'layout' is null then raise exception 'Unsupported generated paper or layout decision.' using errcode='23514'; end if;
  perform private.validate_exam_blueprint_intent(p->'intent'); plan:=p#>'{intent,blueprint}'; captured:=p->'snapshot';
  if plan->>'ownerId' is distinct from teacher::text then raise exception 'Paper owner is not accessible.' using errcode='42501'; end if;
  if jsonb_typeof(captured) is distinct from 'object' then raise exception 'A captured paper is required.' using errcode='23514'; end if;
  if captured->'schemaVersion' is distinct from '2'::jsonb or captured->'ownerId' is distinct from plan->'ownerId'
    or captured->'bankId' is distinct from plan#>'{bankIds,0}' or captured->'bankIds' is distinct from plan->'bankIds'
    or captured->'selectionSeed' is distinct from plan->'selectionSeed' or captured->'totalMarks' is distinct from plan->'totalMarks'
    or jsonb_typeof(captured->'branches') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(captured) k where k not in ('schemaVersion','ownerId','bankId','bankIds','selectionSeed','totalMarks','branches')) then
    raise exception 'Captured paper identity or totals differ from the blueprint.' using errcode='23514'; end if;
  if jsonb_array_length(captured->'branches')<>jsonb_array_length(plan->'branches') then raise exception 'Captured branches are incomplete.' using errcode='23514'; end if;
  select array_agg(value::uuid) into banks from jsonb_array_elements_text(plan->'bankIds');
  perform 1 from public.question_banks where id=any(banks) order by id for share;
  if (select count(*) from public.question_banks where id=any(banks) and owner_id=teacher and not is_archived)<>cardinality(banks) then
    raise exception 'An active selected bank is not accessible.' using errcode='42501'; end if;
  select array_agg((entry->'question'->>'id')::uuid) into selected_ids from jsonb_array_elements(captured->'branches') b,
    lateral jsonb_array_elements(b->'items') entry;
  perform 1 from public.question_groups g where g.owner_id=teacher and g.id in (select m.group_id from public.question_group_questions m where m.question_id=any(selected_ids)) order by g.id for share;
  perform 1 from public.questions where id=any(selected_ids) and owner_id=teacher order by id for share;
  perform 1 from public.question_bank_memberships where question_id=any(selected_ids) and bank_id=any(banks) order by bank_id,question_id for share;
  for branch in select value from jsonb_array_elements(captured->'branches') loop
    spec:=plan->'branches'->branch_index;
    if not(spec ? 'reviewedQuestionRevisions') or jsonb_typeof(branch->'items') is distinct from 'array' then
      raise exception 'Save the complete current review and source versions first.' using errcode='23514'; end if;
    attempted:=case when spec#>>'{answerRule,kind}'='points' then (spec#>>'{answerRule,pointsToAnswer}')::integer else 1 end;
    expected_instruction:=(spec->>'instruction')||case spec#>>'{answerRule,kind}' when 'points'
      then E'\nAnswer '||attempted::text||' of '||(spec->>'displayedPointCount')||'.' when 'choose-one' then E'\nChoose one topic: A or B.' else '' end;
    if branch-'items'-'pointMarks'-'passageGroup'-'completionGroup' is distinct from jsonb_build_object(
      'id',spec->'id','mainQuestionNumber',spec->'mainQuestionNumber','branchLabel',spec->'branchLabel','kind',spec->'kind',
      'instruction',expected_instruction,'arabicInstruction',spec->'arabicInstruction','marks',spec->'marks','attemptCount',attempted,'answerRule',spec->'answerRule')
      or jsonb_array_length(branch->'items')<>(spec->>'quantity')::integer or jsonb_typeof(branch->'pointMarks') is distinct from 'object' then
      raise exception 'Captured branch placement, instructions, count, rules or marks differ.' using errcode='23514'; end if;
    select array_agg((value->'question'->>'id')::uuid order by ordinality) into branch_ids from jsonb_array_elements(branch->'items') with ordinality;
    if to_jsonb(branch_ids) is distinct from spec->'orderedQuestionIds'
      or exists(select 1 from jsonb_array_elements_text(spec->'includedQuestionIds') e where not(e::uuid=any(branch_ids)))
      or exists(select 1 from jsonb_array_elements_text(spec->'lockedQuestionIds') e where not(e::uuid=any(branch_ids))) then
      raise exception 'Chosen order, Include or Lock differs from the saved blueprint.' using errcode='23514'; end if;
    group_id:=null; context:=null;
    if branch->>'kind'='passage' or branch->>'kind'='completion' and cardinality(branch_ids)>1 then
      context:=case when branch->>'kind'='passage' then branch->'passageGroup' else branch->'completionGroup' end;
      if jsonb_typeof(context) is distinct from 'object' or spec->'reviewedGroup' is distinct from jsonb_build_object('id',context->'id','revision',context->'revision') then
        raise exception 'Capture the complete reviewed source group.' using errcode='23514'; end if;
      group_id:=(context->>'id')::uuid;
      select * into group_row from public.question_groups where id=group_id and owner_id=teacher for share;
      if not found or group_row.revision is distinct from (context->>'revision')::integer then
        raise exception 'The complete source group changed or is unavailable.' using errcode='40001'; end if;
      select array_agg(m.question_id order by m.position) into member_ids from public.question_group_questions m where m.group_id=group_row.id;
      if member_ids is distinct from branch_ids or (select array_agg(m.position::integer order by m.position) from public.question_group_questions m where m.group_id=group_row.id)
        is distinct from array(select generate_series(1,cardinality(branch_ids))) then
        raise exception 'Required linked children or their order changed.' using errcode='23514'; end if;
      if branch->>'kind'='passage' then
        if branch ? 'completionGroup' or group_row.group_type<>'passage' or group_row.parent_group_id is not null
          or context-'children' is distinct from jsonb_build_object('id',group_row.id,'ownerId',group_row.owner_id,'bankId',group_row.content->>'bankId',
            'revision',group_row.revision,'schemaVersion',group_row.schema_version,'title',group_row.title,'instruction',group_row.instructions,
            'arabicInstruction',group_row.content->'arabicInstruction','passage',group_row.content->>'text','attemptCount',group_row.attempt_count,'expectedMarks',group_row.expected_marks)
          or group_row.content->'childIds' is distinct from to_jsonb(member_ids) or jsonb_typeof(context->'children') is distinct from 'array' then
          raise exception 'Captured passage differs from its source.' using errcode='23514'; end if;
        if jsonb_array_length(context->'children')<>cardinality(branch_ids) or exists(select 1 from jsonb_array_elements(context->'children') with ordinality children(child,ordinality)
          where child is distinct from jsonb_build_object('position',ordinality,'question',branch->'items'->((ordinality-1)::integer)->'question')) then
          raise exception 'Passage children differ from the captured questions.' using errcode='23514'; end if;
      else
        if branch ? 'passageGroup' or group_row.group_type not in ('branch','main-question') or group_row.content->>'sourceGroupType' is distinct from 'completion_set'
          or group_row.content#>>'{source,group_completeness}' is distinct from 'complete' or group_row.content#>'{source,display_count}' is distinct from '6'::jsonb
          or group_row.attempt_count is distinct from 5 or cardinality(branch_ids)<>6
          or context is distinct from jsonb_build_object('id',group_row.id,'ownerId',group_row.owner_id,'bankId',group_row.content->>'bankId',
            'revision',group_row.revision,'schemaVersion',group_row.schema_version,'title',group_row.title,'instruction',group_row.instructions,
            'attemptCount',group_row.attempt_count,'expectedMarks',group_row.expected_marks,'content',group_row.content,'childIds',to_jsonb(member_ids)) then
          raise exception 'Captured completion exercise differs from its complete source.' using errcode='23514'; end if;
      end if;
    elsif branch ? 'passageGroup' or branch ? 'completionGroup' or spec ? 'reviewedGroup' then
      raise exception 'Standalone questions cannot capture partial groups.' using errcode='23514';
    end if;
    points:='{}'; item_index:=0; point_map:=branch->'pointMarks';
    for item in select value from jsonb_array_elements(branch->'items') loop
      q:=item->'question'; canonical_id:=(q->>'id')::uuid;
      expected_label:=case when branch->>'kind'='alternatives' then case when item_index=0 then 'A' else 'B' end else (item_index+1)::text end;
      if item is distinct from jsonb_build_object('label',expected_label,'question',q) or canonical_id=any(seen)
        or spec->'reviewedQuestionRevisions'->canonical_id::text is distinct from q->'revision'
        or spec->'excludedQuestionIds' ? canonical_id::text or not(spec->'questionTypes' ? (q->>'type'))
        or jsonb_array_length(spec->'units')>0 and not(spec->'units' @> jsonb_build_array(q->'unit'))
        or jsonb_array_length(spec->'lessons')>0 and not(spec->'lessons' ? (q->>'lesson'))
        or jsonb_array_length(spec->'difficulties')>0 and not(spec->'difficulties' ? (q->>'difficulty')) then
        raise exception 'Question identity, order, versions or filters conflict.' using errcode='23514'; end if;
      seen:=array_append(seen,canonical_id);
      select * into question_row from public.questions where id=canonical_id and owner_id=teacher;
      if not found or not exists(select 1 from public.question_bank_memberships m where m.question_id=canonical_id and m.owner_id=teacher and m.bank_id=any(banks)) then
        raise exception 'A selected question is outside accessible banks.' using errcode='42501'; end if;
      if not question_row.is_active or question_row.current_revision is distinct from (q->>'revision')::integer then
        raise exception 'A chosen question changed or was withdrawn.' using errcode='40001'; end if;
      select * into revision_row from public.question_revisions where question_id=canonical_id and revision=(q->>'revision')::integer and owner_id=teacher;
      if not found or q is distinct from jsonb_build_object('id',revision_row.question_id,'ownerId',revision_row.owner_id,'bankId',revision_row.bank_id,
        'externalId',revision_row.external_id,'unit',revision_row.unit,'lesson',revision_row.lesson,'type',revision_row.question_type,'schemaVersion',revision_row.schema_version,
        'difficulty',revision_row.difficulty,'prompt',revision_row.prompt,'marks',revision_row.marks,'content',revision_row.content,'answer',revision_row.answer,
        'isActive',revision_row.is_active,'revision',revision_row.revision) then raise exception 'Captured question differs from its exact source revision.' using errcode='23514'; end if;
      if group_id is null and exists(select 1 from public.question_group_questions m join public.question_groups g on g.id=m.group_id
        where m.question_id=canonical_id and (g.group_type='passage' or g.content->>'sourceGroupType'='completion_set')) then
        raise exception 'A linked child cannot be used as a standalone question.' using errcode='23514'; end if;
      if branch->>'kind'='matching' and (q->>'type'<>'matching' or cardinality(branch_ids)<>1)
        or branch->>'kind'='completion' and q->>'type'<>'completion'
        or branch->>'kind' in ('questions','alternatives') and q->>'type' in ('matching','completion')
        or spec#>>'{answerRule,kind}'='choose-one' and q->>'type'<>'extended-writing'
        or spec#>>'{answerRule,kind}'='task' and not(q->>'type'='extended-writing' or q->>'type'='rewrite' and q#>>'{content,instruction}' ~* 'punctuation')
        or spec#>>'{answerRule,kind}'='points' and (q->>'type'='extended-writing' or q->>'type'='rewrite' and q#>>'{content,instruction}' ~* 'punctuation') then
        raise exception 'Question type or response rule differs from this branch.' using errcode='23514'; end if;
      if branch->>'kind'='passage' then item_points:=array[group_id::text||':child:'||canonical_id::text];
      elsif q->>'type'='matching' then
        select array_agg(canonical_id::text||':pair:'||(value->>'id') order by ordinality) into item_points from jsonb_array_elements(q#>'{content,left}') with ordinality;
      elsif q->>'type'='completion' then
        select array_agg(canonical_id::text||':blank:'||value order by ordinality) into item_points from jsonb_array_elements_text(q#>'{content,blankIds}') with ordinality;
        if group_id is not null and (cardinality(item_points)<>1 or q#>'{content,wordBank}' is distinct from branch#>'{items,0,question,content,wordBank}' or q->'bankId' is distinct from context->'bankId') then
          raise exception 'Completion children lost their shared source context.' using errcode='23514'; end if;
      else item_points:=array[canonical_id::text]; end if;
      if branch->>'kind'='passage' and (q->>'type' in ('matching','completion','extended-writing') or cardinality(item_points)<>1 or q->'bankId' is distinct from context->'bankId') then
        raise exception 'Passage children must retain one answerable point each.' using errcode='23514'; end if;
      points:=points||item_points;
      point_marks:='{}'; foreach point_id in array item_points loop
        point_marks:=point_marks||jsonb_build_object(point_id,point_map->point_id);
      end loop;
      if group_id is null and branch->>'kind' in ('matching','completion') then assigned_marks:=(branch->>'marks')::smallint; mark_attempt_count:=attempted;
      else assigned_marks:=(point_map->>item_points[1])::smallint; mark_attempt_count:=1; end if;
      revision_id:=revision_row.id; item_position:=position+1; path:=jsonb_build_array(branch->>'id',expected_label); label:=expected_label;
      source_group_id:=group_id; is_locked:=spec->'lockedQuestionIds' ? canonical_id::text;
      return next; position:=position+1; item_index:=item_index+1;
    end loop;
    if cardinality(points)<>(spec->>'displayedPointCount')::integer or not public.valid_attempt_exam_point_marks((branch->>'marks')::smallint,point_map,attempted::smallint)
      or (select array_agg(key order by key) from jsonb_object_keys(point_map) key) is distinct from (select array_agg(value order by value) from unnest(points) value)
      or spec#>>'{distribution,mode}'='custom' and point_map is distinct from spec#>'{distribution,marksByPoint}'
      or spec#>>'{distribution,mode}'='equal' and exists(select 1 from jsonb_each(point_map) where value::text::integer<>(branch->>'marks')::integer/attempted) then
      raise exception 'Captured point identities or attempt-aware marks differ from the blueprint.' using errcode='23514'; end if;
    if branch->>'kind'='alternatives' and (select count(distinct lower(regexp_replace(btrim(value#>>'{question,prompt}'),'\s+',' ','g'))) from jsonb_array_elements(branch->'items'))<>2 then
      raise exception 'Writing alternatives need distinct printed prompts.' using errcode='23514'; end if;
    branch_index:=branch_index+1;
  end loop;
  if position<>(select sum((value->>'quantity')::integer) from jsonb_array_elements(plan->'branches')) or position not between 1 and 50 then
    raise exception 'Generated paper is incomplete or too large.' using errcode='23514'; end if;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid captured paper value.' using errcode='23514';
end;
$$;
revoke all on function private.validate_blueprint_paper(jsonb) from public,anon,authenticated;

create or replace function private.check_complete_exam_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.exam_snapshots%rowtype; child_count integer; canonical_count integer; expected_count integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.workflow is null then return null; end if;
  if s.workflow->>'profileId'='exam-blueprint-paper-v1' then
    if s.owner_id is distinct from auth.uid() or not s.sealed or s.schema_version is distinct from 2 or s.source_draft_id is null or s.source_draft_version is null or s.request_id is null
      or s.owner_id::text is distinct from s.workflow#>>'{intent,blueprint,ownerId}'
      or s.selection_seed is distinct from (s.workflow#>>'{snapshot,selectionSeed}')::bigint
      or s.total_marks is distinct from (s.workflow#>>'{snapshot,totalMarks}')::integer
      or s.document_status is distinct from 'needs-review'
      or s.two_page_approved is distinct from (s.workflow#>>'{layout,decision}'='unchanged-two-page')
      or s.structure is distinct from jsonb_build_object('schemaVersion',2,'snapshot',s.workflow->'snapshot')
      or s.settings is distinct from jsonb_build_object('schemaVersion',2,'teacherIntent',s.workflow-'snapshot')
      or not exists(select 1 from public.exam_drafts d where d.id=s.source_draft_id and d.owner_id=s.owner_id
        and d.workflow_version=s.source_draft_version and d.workflow=s.workflow->'intent') then
      raise exception 'General paper identity or sealing is incomplete.' using errcode='23514';
    end if;
    select count(*) into child_count from public.exam_snapshot_questions c where c.snapshot_id=s.id;
    select count(*) into expected_count from private.validate_blueprint_paper(s.workflow);
    if child_count<>expected_count or exists(select 1 from private.validate_blueprint_paper(s.workflow) e
      left join public.exam_snapshot_questions c on c.snapshot_id=s.id and c.position=e.item_position
      where c.question_revision_id is distinct from e.revision_id or c.owner_id is distinct from s.owner_id
        or c.structure_path is distinct from e.path or c.visible_number is distinct from e.label
        or c.source_group_id is distinct from e.source_group_id or c.is_locked is distinct from e.is_locked
        or c.assigned_marks is distinct from e.assigned_marks or c.point_marks is distinct from e.point_marks
        or c.mark_attempt_count is distinct from e.mark_attempt_count) then
      raise exception 'General paper children differ from the complete captured review.' using errcode='23514';
    end if;
    return null;
  end if;
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

create function private.finalize_blueprint_paper(p_request_id uuid,p_draft_id uuid,p_expected_version integer,p_workflow jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare teacher uuid:=auth.uid(); d public.exam_drafts%rowtype; s public.exam_snapshots%rowtype; children jsonb;
begin
  if teacher is null or p_request_id is null then raise exception 'Authenticated request identity required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(teacher::text||':'||p_request_id::text,0));
  select * into s from public.exam_snapshots where owner_id=teacher and request_id=p_request_id;
  if found then
    if s.workflow is distinct from p_workflow or s.source_draft_id is distinct from p_draft_id or s.source_draft_version is distinct from p_expected_version then
      raise exception 'Retry identity conflict.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
  end if;
  select * into d from public.exam_drafts where id=p_draft_id and owner_id=teacher for update;
  if not found or d.workflow->>'profileId' is distinct from 'exam-blueprint-v1' then raise exception 'Blueprint is not accessible.' using errcode='42501'; end if;
  if d.workflow_version is distinct from p_expected_version or d.workflow is distinct from p_workflow->'intent' then
    raise exception 'Blueprint changed before finalization. Save and review its current version.' using errcode='40001'; end if;
  select * into s from public.exam_snapshots where owner_id=teacher and source_draft_id=p_draft_id and source_draft_version=p_expected_version;
  if found then
    if s.workflow is distinct from p_workflow then raise exception 'This blueprint version already has a different final paper.' using errcode='23505'; end if;
    return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
  end if;
  select jsonb_agg(to_jsonb(v)) into children from private.validate_blueprint_paper(p_workflow) v;
  insert into public.exam_snapshots(owner_id,source_draft_id,source_draft_version,schema_version,selection_seed,settings,structure,total_marks,document_status,two_page_approved,workflow,request_id)
    values(teacher,p_draft_id,p_expected_version,2,(p_workflow#>>'{snapshot,selectionSeed}')::bigint,
      jsonb_build_object('schemaVersion',2,'teacherIntent',p_workflow-'snapshot'),jsonb_build_object('schemaVersion',2,'snapshot',p_workflow->'snapshot'),
      (p_workflow#>>'{snapshot,totalMarks}')::smallint,'needs-review',p_workflow#>>'{layout,decision}'='unchanged-two-page',p_workflow,p_request_id) returning * into s;
  insert into public.exam_snapshot_questions(snapshot_id,question_revision_id,owner_id,position,is_locked,source_group_id,structure_path,visible_number,assigned_marks,point_marks,mark_attempt_count)
    select s.id,(x->>'revision_id')::uuid,teacher,(x->>'item_position')::smallint,(x->>'is_locked')::boolean,
      (x->>'source_group_id')::uuid,x->'path',x->>'label',(x->>'assigned_marks')::smallint,x->'point_marks',(x->>'mark_attempt_count')::smallint
    from jsonb_array_elements(children) x;
  update public.exam_snapshots set sealed=true where id=s.id;
  return jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow);
end;
$$;
create function public.finalize_blueprint_paper(p_request_id uuid,p_draft_id uuid,p_expected_version integer,p_workflow jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.finalize_blueprint_paper(p_request_id,p_draft_id,p_expected_version,p_workflow); $$;
create function public.get_blueprint_papers(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to open saved papers.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 25 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid paper page.' using errcode='23514'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'version',1,'finalized',true,'savedAt',s.created_at,'workflow',s.workflow) order by s.created_at desc,s.id desc)
    from (select * from public.exam_snapshots where owner_id=auth.uid() and sealed and workflow->>'profileId'='exam-blueprint-paper-v1'
      and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit p_limit) s),'[]'::jsonb);
end;
$$;
revoke all on function private.finalize_blueprint_paper(uuid,uuid,integer,jsonb),public.finalize_blueprint_paper(uuid,uuid,integer,jsonb),public.get_blueprint_papers(timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function private.finalize_blueprint_paper(uuid,uuid,integer,jsonb),public.finalize_blueprint_paper(uuid,uuid,integer,jsonb),public.get_blueprint_papers(timestamptz,uuid,integer) to authenticated;

-- Seal deletion as well as mutation. Unsealed and historical insert paths keep their existing behavior.
create trigger exam_snapshots_guard_sealed_delete before delete on public.exam_snapshots
  for each row when (old.sealed) execute function private.guard_sealed_exam_snapshot();
commit;
