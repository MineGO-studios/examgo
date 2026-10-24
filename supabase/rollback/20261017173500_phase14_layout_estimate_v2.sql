-- Rollback for 20261017173500_phase14_layout_estimate_v2.sql: restore the reviewed estimateVersion 1 only body.
-- Run only with separate owner authorization. Existing stored rows are not modified.

create or replace function private.validate_blueprint_paper(p jsonb)
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
