-- Server-side import validation complements the shared browser domain checks.
-- No imported activity, source review field or membership grants publication.
create function private.catalogue_text_array(p_value jsonb, p_min integer, p_max integer)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  return jsonb_array_length(p_value) between p_min and p_max and not exists (
    select 1 from jsonb_array_elements(p_value) v
    where jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = ''
  );
end;
$$;
revoke all on function private.catalogue_text_array(jsonb,integer,integer) from public,anon,authenticated;

create function private.validate_catalogue_question(p_row jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  c jsonb := p_row->'content';
  a jsonb := p_row->'answer';
  kind text := p_row->>'question_type';
  item jsonb;
  side text;
  words text[];
  answers text[];
  valid boolean := false;
begin
  if (jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
    or c->>'type' is distinct from kind or a->>'type' is distinct from kind
    or c->'schemaVersion' is distinct from '1'::jsonb or a->'schemaVersion' is distinct from '1'::jsonb
    or p_row->'schema_version' is distinct from '1'::jsonb
    or p_row->'marks' is distinct from 'null'::jsonb or p_row->'is_active' is distinct from 'true'::jsonb
    or (p_row->>'unit') !~ '^[1-8]$'
    or char_length(btrim(p_row->>'lesson')) not between 1 and 40
    or char_length(btrim(p_row->>'prompt')) not between 1 and 2000
    or char_length(btrim(p_row->>'external_id')) not between 1 and 80) is distinct from false then
    raise exception 'Canonical import question envelope or mark ownership is invalid.' using errcode='23514';
  end if;
  case kind
    when 'multiple-choice' then
      if jsonb_typeof(c->'options') <> 'array' then valid := false;
      else
        valid := jsonb_array_length(c->'options') between 2 and 6
          and not exists(select 1 from jsonb_array_elements(c->'options') v
            where jsonb_typeof(v->'label') is distinct from 'string'
              or char_length(btrim(v->>'label')) not between 1 and 10
              or jsonb_typeof(v->'text') is distinct from 'string' or btrim(v->>'text')='')
          and (select count(distinct upper(btrim(v->>'label'))) from jsonb_array_elements(c->'options') v)
            = jsonb_array_length(c->'options')
          and exists(select 1 from jsonb_array_elements(c->'options') v
            where upper(btrim(v->>'label'))=upper(btrim(a->>'correctOptionLabel')))
          and p_row->'options'=c->'options'
          and p_row->>'correct_option_label'=a->>'correctOptionLabel';
      end if;
    when 'binary' then
      valid := c->>'labelMode' in ('true-false','yes-no') and jsonb_typeof(a->'isTrue')='boolean';
    when 'short-answer' then
      valid := jsonb_typeof(a->'canonicalAnswer')='string' and btrim(a->>'canonicalAnswer')<>''
        and private.catalogue_text_array(a->'approvedVariants',0,100)
        and jsonb_typeof(a->'caseSensitive')='boolean'
        and (c->>'answerLines') ~ '^(?:[1-9]|1[0-9]|20)$';
      if valid then
        valid := (select count(distinct lower(btrim(v))) from jsonb_array_elements_text(a->'approvedVariants') v)
          = jsonb_array_length(a->'approvedVariants') and not exists (
          select 1 from jsonb_array_elements_text(a->'approvedVariants') v
          where lower(btrim(v))=lower(btrim(a->>'canonicalAnswer')));
      end if;
    when 'odd-word' then
      valid := private.catalogue_text_array(c->'words',3,100) and jsonb_typeof(a->'oddWord')='string'
        and (c->'words') ? (a->>'oddWord');
    when 'word-relationship' then
      valid := private.catalogue_text_array(c->'words',2,2)
        and private.catalogue_text_array(a->'acceptedAnswers',1,100);
    when 'rewrite' then
      valid := jsonb_typeof(c->'instruction')='string' and btrim(c->>'instruction')<>''
        and private.catalogue_text_array(a->'acceptedAnswers',1,100);
    when 'completion' then
      valid := jsonb_typeof(c->'text')='string' and btrim(c->>'text')<>''
        and private.catalogue_text_array(c->'blankIds',1,100)
        and private.catalogue_text_array(c->'wordBank',1,100)
        and c->>'wordBankOrder' in ('ordered','unordered')
        and jsonb_typeof(c->'allowWordReuse')='boolean'
        and jsonb_typeof(c->'requireAllWordsUsed')='boolean'
        and jsonb_typeof(a->'answers')='object';
      if valid then
        select array_agg(lower(btrim(v))) into words from jsonb_array_elements_text(c->'wordBank') v;
        select array_agg(lower(btrim(v))) into answers from jsonb_each_text(a->'answers') as pair(k,v);
        valid := (select count(distinct v) from jsonb_array_elements_text(c->'blankIds') v)
            = jsonb_array_length(c->'blankIds')
          and (select count(distinct v) from unnest(words) v)=cardinality(words)
          and (select count(*) from jsonb_object_keys(a->'answers'))=jsonb_array_length(c->'blankIds')
          and not exists(select 1 from jsonb_array_elements_text(c->'blankIds') v
            where not (a->'answers' ? v) or jsonb_typeof(a->'answers'->v)<>'string' or btrim(a->'answers'->>v)='')
          and answers <@ words
          and ((c->>'allowWordReuse')::boolean or (select count(distinct v) from unnest(answers) v)=cardinality(answers))
          and (not (c->>'requireAllWordsUsed')::boolean or words <@ answers);
      end if;
    when 'matching' then
      valid := true;
      foreach side in array array['left','right'] loop
        if jsonb_typeof(c->side) is distinct from 'array' then valid:=false; exit; end if;
        if jsonb_array_length(c->side) not between 2 and 20 then valid:=false; exit; end if;
        for item in select value from jsonb_array_elements(c->side) loop
          if jsonb_typeof(item->'id') is distinct from 'string' or char_length(btrim(item->>'id')) not between 1 and 100
            or jsonb_typeof(item->'text') is distinct from 'string' or char_length(btrim(item->>'text')) not between 1 and 1000 then
            valid:=false;
          end if;
        end loop;
        if (select count(distinct v->>'id') from jsonb_array_elements(c->side) v)<>jsonb_array_length(c->side) then valid:=false; end if;
      end loop;
      if valid and jsonb_typeof(a->'pairs')='array' then
        valid := jsonb_array_length(c->'left')=jsonb_array_length(c->'right')
          and jsonb_array_length(a->'pairs')=jsonb_array_length(c->'left')
          and (select count(distinct v->>'leftId') from jsonb_array_elements(a->'pairs') v)=jsonb_array_length(a->'pairs')
          and (select count(distinct v->>'rightId') from jsonb_array_elements(a->'pairs') v)=jsonb_array_length(a->'pairs')
          and not exists(select 1 from jsonb_array_elements(a->'pairs') v where
            not exists(select 1 from jsonb_array_elements(c->'left') l where l->>'id'=v->>'leftId') or
            not exists(select 1 from jsonb_array_elements(c->'right') r where r->>'id'=v->>'rightId'));
      else valid:=false;
      end if;
    when 'extended-writing' then
      valid := ((a ? 'modelAnswer' and jsonb_typeof(a->'modelAnswer')='string' and btrim(a->>'modelAnswer')<>'')
        or private.catalogue_text_array(a->'rubricCriteria',1,100))
        is distinct from coalesce(a->>'manualMarkingNote'='Manual marking — no approved model provided',false);
      valid := valid and (not (a ? 'modelAnswer') or (jsonb_typeof(a->'modelAnswer')='string' and btrim(a->>'modelAnswer')<>''))
        and (not (a ? 'rubricCriteria') or private.catalogue_text_array(a->'rubricCriteria',1,100))
        and (not (a ? 'manualMarkingNote') or a->>'manualMarkingNote'='Manual marking — no approved model provided');
      if c ? 'minimumWords' then valid:=valid and (c->>'minimumWords') ~ '^[1-9][0-9]{0,3}$' and (c->>'minimumWords')::integer<=1000; end if;
      if c ? 'maximumWords' then valid:=valid and (c->>'maximumWords') ~ '^[1-9][0-9]{0,3}$' and (c->>'maximumWords')::integer<=2000; end if;
      if c ? 'minimumWords' and c ? 'maximumWords' then valid:=valid and (c->>'minimumWords')::integer<=(c->>'maximumWords')::integer; end if;
    else valid:=false;
  end case;
  if valid is distinct from true then raise exception 'Canonical import typed content or answer is invalid.' using errcode='23514'; end if;
end;
$$;
revoke all on function private.validate_catalogue_question(jsonb) from public,anon,authenticated;

-- Immutable receipt binds original staged evidence to the first canonical rows.
create table public.catalogue_promotion_batches (
  import_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  component_key text not null check (component_key ~ '^[0-9a-f]{32}$'),
  catalogue_ids text[] not null check (cardinality(catalogue_ids) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  primary key(import_id,component_key),
  foreign key(import_id,owner_id) references public.catalogue_imports(id,owner_id) on delete cascade
);
create index catalogue_promotion_batches_owner_idx on public.catalogue_promotion_batches(owner_id);
alter table public.catalogue_promotion_batches enable row level security;
revoke all on public.catalogue_promotion_batches from public,anon,authenticated;
grant select on public.catalogue_promotion_batches to authenticated;
create policy catalogue_promotion_batches_owner_read on public.catalogue_promotion_batches
  for select to authenticated using(owner_id=(select auth.uid()));

-- Definer privileges are limited to this validated transaction. The exposed
-- wrapper is invoker; callers cannot forge or update an import receipt directly.
create function private.commit_catalogue_component(p_import_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  teacher uuid:=auth.uid();
  source_bank uuid;
  expected_rows integer;
  ids text[];
  source_groups text[];
  batch_key text;
  receipt jsonb;
  entry jsonb;
  staged public.catalogue_import_rows%rowtype;
  original jsonb;
  group_entry jsonb;
  canonical_group uuid;
  points integer;
  member_count integer;
  group_count integer:=0;
begin
  if teacher is null then raise exception 'Sign in before importing.' using errcode='42501'; end if;
  select i.source_bank_id,i.expected_rows into source_bank,expected_rows
    from public.catalogue_imports i where i.id=p_import_id and i.owner_id=teacher for update;
  if not found then raise exception 'Import is missing or inaccessible.' using errcode='42501'; end if;
  -- Stable bank lock order serializes archive/placement changes through commit.
  perform b.id from public.question_banks b where b.owner_id=teacher
    and (b.id=source_bank or b.collection_unit is not null) order by b.id for update;
  if not exists(select 1 from public.question_banks b where b.id=source_bank and b.owner_id=teacher and not b.is_archived) then
    raise exception 'Source bank is missing or archived.' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>1500000
    or jsonb_typeof(p_payload->'catalogueIds') is distinct from 'array'
    or jsonb_typeof(p_payload->'questions') is distinct from 'array'
    or jsonb_typeof(p_payload->'groups') is distinct from 'array'
    or jsonb_typeof(p_payload->'members') is distinct from 'array' then
    raise exception 'Canonical batch shape or size is invalid.' using errcode='23514';
  end if;
  select array_agg(v order by v) into ids from jsonb_array_elements_text(p_payload->'catalogueIds') v;
  if ids is null or cardinality(ids) not between 1 and 100 or (select count(distinct v) from unnest(ids) v)<>cardinality(ids)
    or exists(select 1 from unnest(ids) v where v !~ '^[A-Za-z0-9_-]{1,100}$')
    or jsonb_array_length(p_payload->'questions')<>cardinality(ids)
    or jsonb_array_length(p_payload->'groups')>100 or jsonb_array_length(p_payload->'members')>10000 then
    raise exception 'Canonical batch identities or counts are invalid.' using errcode='23514';
  end if;
  if (select count(*) from public.catalogue_import_rows r where r.import_id=p_import_id and r.owner_id=teacher)<>expected_rows
    or (select count(*) from public.catalogue_import_rows r where r.import_id=p_import_id and r.catalogue_id=any(ids) and r.owner_id=teacher)<>cardinality(ids) then
    raise exception 'The complete staged source must be saved before promotion.' using errcode='23514';
  end if;
  select coalesce(array_agg(distinct g),'{}'::text[]) into source_groups
    from public.catalogue_import_rows r cross join lateral unnest(r.group_ids) g
    where r.import_id=p_import_id and r.catalogue_id=any(ids);
  if exists(select 1 from public.catalogue_import_rows r where r.import_id=p_import_id
    and r.group_ids && source_groups and not r.catalogue_id=any(ids)) then
    raise exception 'A connected source group cannot be split across commits.' using errcode='23514';
  end if;
  batch_key:=md5(to_jsonb(ids)::text);
  select b.payload into receipt from public.catalogue_promotion_batches b
    where b.import_id=p_import_id and b.component_key=batch_key and b.owner_id=teacher;
  if found then
    if receipt is distinct from p_payload then raise exception 'Import retry conflicts with the saved conversion.' using errcode='23505'; end if;
    if exists(select 1 from jsonb_array_elements(receipt->'questions') q
      where not exists(select 1 from public.question_revisions r
        where r.question_id=(q->>'id')::uuid and r.owner_id=teacher and r.revision=1)) then
      raise exception 'Saved canonical import revision is missing.' using errcode='23514';
    end if;
    return jsonb_build_object('inserted',0,'unchanged',cardinality(ids),'componentKey',batch_key);
  end if;
  if (select count(distinct v->>'external_id') from jsonb_array_elements(p_payload->'questions') v)<>cardinality(ids)
    or (select count(distinct v->>'id') from jsonb_array_elements(p_payload->'questions') v)<>cardinality(ids) then
    raise exception 'Canonical question identities must be unique.' using errcode='23514';
  end if;
  for entry in select value from jsonb_array_elements(p_payload->'questions') loop
    perform private.validate_catalogue_question(entry);
    select r.* into staged from public.catalogue_import_rows r where r.import_id=p_import_id
      and r.catalogue_id=entry->>'external_id' and r.catalogue_id=any(ids) and r.owner_id=teacher;
    if not found or staged.normalized is null
      or (cardinality(staged.group_ids)>0 and staged.normalized->>'groupCompleteness' is distinct from 'complete')
      or entry->>'owner_id' is distinct from teacher::text or entry->>'bank_id' is distinct from source_bank::text
      or (entry->>'unit')::integer is distinct from staged.display_unit
      or entry->>'lesson' is distinct from btrim(staged.normalized->>'lesson')
      or entry->>'prompt' is distinct from btrim(staged.normalized->>'prompt')
      or entry->>'question_type' is distinct from staged.normalized->>'type'
      or entry->>'difficulty' is distinct from staged.normalized->>'difficulty' then
      raise exception 'Canonical question disagrees with its complete staged source.' using errcode='23514';
    end if;
    insert into public.questions(id,owner_id,bank_id,external_id,unit,lesson,question_type,schema_version,
      difficulty,prompt,marks,is_active,content,answer,options,correct_option_label)
    values((entry->>'id')::uuid,teacher,source_bank,entry->>'external_id',(entry->>'unit')::smallint,
      entry->>'lesson',entry->>'question_type',1,entry->>'difficulty',entry->>'prompt',null,true,
      entry->'content',entry->'answer',nullif(entry->'options','null'::jsonb),entry->>'correct_option_label');
  end loop;
  if jsonb_array_length(p_payload->'groups')<>cardinality(source_groups)
    or (select count(distinct v->'content'->'source'->>'group_id') from jsonb_array_elements(p_payload->'groups') v)<>cardinality(source_groups)
    or (select count(distinct v->>'id') from jsonb_array_elements(p_payload->'groups') v)<>cardinality(source_groups) then
    raise exception 'Every original source group needs one canonical group.' using errcode='23514';
  end if;
  -- Parent-first traversal satisfies the existing immediate foreign key.
  for group_entry in with recursive tree as (
    select v,0 as depth from jsonb_array_elements(p_payload->'groups') v where v->>'parent_group_id' is null
    union all select child.v,tree.depth+1 from tree
      join jsonb_array_elements(p_payload->'groups') child(v) on child.v->>'parent_group_id'=tree.v->>'id'
      where tree.depth<100
  ) select v from tree order by depth,v->>'id' loop
    canonical_group:=(group_entry->>'id')::uuid;
    original:=group_entry->'content'->'source';
    if original->>'group_id' is null or not (original->>'group_id'=any(source_groups))
      or original->>'group_completeness' is distinct from 'complete'
      or group_entry->>'owner_id' is distinct from teacher::text
      or group_entry->'expected_marks' is distinct from 'null'::jsonb
      or group_entry->'content'->>'bankId' is distinct from source_bank::text
      or group_entry->'content'->>'sourceGroupType' is distinct from original->>'group_type'
      or group_entry->>'group_type' is distinct from (case
        when original->>'group_type'='passage' then 'passage'
        when original->>'group_type'='alternatives' then 'alternative-choice'
        when original->>'group_type'='printed_section' and coalesce(original->>'branch_label','')='' then 'main-question'
        when original->>'group_type' in ('branch','printed_section','matching_set','completion_set') then 'branch' end)
      or group_entry->>'instructions' is distinct from nullif(original->>'instructions','')
      or group_entry->>'attempt_count' is distinct from nullif(original->>'attempt_count','') then
      raise exception 'Canonical group envelope or source rules are invalid.' using errcode='23514';
    end if;
    -- All repeated raw group contexts must match the reviewed group exactly.
    if exists(select 1 from public.catalogue_import_rows r
      cross join lateral jsonb_array_elements((r.source_fields->>'group_context_json')::jsonb) context
      where r.import_id=p_import_id and r.catalogue_id=any(ids)
        and context->>'group_id'=original->>'group_id' and context is distinct from original) then
      raise exception 'Source group metadata conflicts with the conversion.' using errcode='23514';
    end if;
    if (nullif(original->>'parent_group_id','') is null) is distinct from (group_entry->>'parent_group_id' is null)
      or (nullif(original->>'parent_group_id','') is not null and not exists(
        select 1 from jsonb_array_elements(p_payload->'groups') parent
        where parent->>'id'=group_entry->>'parent_group_id' and parent->'content'->'source'->>'group_id'=original->>'parent_group_id')) then
      raise exception 'Source group hierarchy changed during conversion.' using errcode='23514';
    end if;
    if group_entry->>'parent_group_id' is not null and (
      group_entry->>'position' !~ '^[1-9][0-9]?$|^100$' or
      exists(select 1 from jsonb_array_elements(p_payload->'groups') sibling
        where sibling->>'parent_group_id'=group_entry->>'parent_group_id'
          and sibling->>'id'<>group_entry->>'id' and sibling->>'position'=group_entry->>'position')) then
      raise exception 'Child group positions must be distinct positive whole numbers.' using errcode='23514';
    end if;
    if exists((select q->>'id' from jsonb_array_elements(p_payload->'questions') q
      join public.catalogue_import_rows r on r.import_id=p_import_id and r.catalogue_id=q->>'external_id'
      where original->>'group_id'=any(r.group_ids)
      except select m->>'question_id' from jsonb_array_elements(p_payload->'members') m where m->>'group_id'=canonical_group::text)
      union all (select m->>'question_id' from jsonb_array_elements(p_payload->'members') m where m->>'group_id'=canonical_group::text
      except select q->>'id' from jsonb_array_elements(p_payload->'questions') q
      join public.catalogue_import_rows r on r.import_id=p_import_id and r.catalogue_id=q->>'external_id' where original->>'group_id'=any(r.group_ids))) then
      raise exception 'Source group membership changed during conversion.' using errcode='23514';
    end if;
    select count(*),coalesce(sum(case q->>'question_type'
      when 'matching' then jsonb_array_length(q->'content'->'left')
      when 'completion' then jsonb_array_length(q->'content'->'blankIds') else 1 end),0)
      into member_count,points from jsonb_array_elements(p_payload->'members') m
      join jsonb_array_elements(p_payload->'questions') q on q->>'id'=m->>'question_id'
      where m->>'group_id'=canonical_group::text;
    if exists(select 1 from jsonb_array_elements(p_payload->'members') m
      where m->>'group_id'=canonical_group::text
        and (m->>'position' is null or m->>'position' !~ '^[1-9][0-9]?$|^100$'
          or (m->>'position')::integer>member_count))
      or (select count(distinct m->>'position') from jsonb_array_elements(p_payload->'members') m
        where m->>'group_id'=canonical_group::text)<>member_count then
      raise exception 'Group member positions must cover one to the group size exactly.' using errcode='23514';
    end if;
    if member_count not between 1 and 100 or original->>'display_count' !~ '^[1-9][0-9]{0,3}$'
      or (original->>'display_count')::integer<>points
      or coalesce((group_entry->>'attempt_count')::integer,1)>points then
      raise exception 'Printed group counts or attempt rules disagree with answerable points.' using errcode='23514';
    end if;
    if group_entry->>'group_type'='passage' then
      if group_entry->>'parent_group_id' is not null or group_entry->>'instructions' is null
        or char_length(btrim(group_entry->'content'->>'text')) not between 1 and 5000
        or group_entry->'content'->>'text' is distinct from original->>'passage_text'
        or group_entry->>'attempt_count' is null or (group_entry->>'attempt_count')::integer>member_count
        or group_entry->'content'->'childIds' is distinct from (select jsonb_agg(m->'question_id' order by (m->>'position')::integer)
          from jsonb_array_elements(p_payload->'members') m where m->>'group_id'=canonical_group::text)
        or exists(select 1 from jsonb_array_elements(p_payload->'members') m join jsonb_array_elements(p_payload->'questions') q
          on q->>'id'=m->>'question_id' where m->>'group_id'=canonical_group::text and q->>'question_type'='matching') then
        raise exception 'Passage content, children or attempt rule is invalid.' using errcode='23514';
      end if;
    end if;
    insert into public.question_groups(id,owner_id,group_type,schema_version,parent_group_id,position,title,instructions,content,attempt_count,expected_marks)
    values(canonical_group,teacher,group_entry->>'group_type',1,(group_entry->>'parent_group_id')::uuid,
      (group_entry->>'position')::smallint,null,group_entry->>'instructions',group_entry->'content',(group_entry->>'attempt_count')::smallint,null);
    group_count:=group_count+1;
  end loop;
  if group_count<>cardinality(source_groups) then raise exception 'Group hierarchy is cyclic or incomplete.' using errcode='23514'; end if;
  for entry in select value from jsonb_array_elements(p_payload->'members') loop
    if entry->>'owner_id' is distinct from teacher::text
      or not exists(select 1 from jsonb_array_elements(p_payload->'groups') g where g->>'id'=entry->>'group_id')
      or not exists(select 1 from jsonb_array_elements(p_payload->'questions') q where q->>'id'=entry->>'question_id') then
      raise exception 'Group member is outside this owned component.' using errcode='23514';
    end if;
    insert into public.question_group_questions(group_id,question_id,owner_id,position)
    values((entry->>'group_id')::uuid,(entry->>'question_id')::uuid,teacher,(entry->>'position')::smallint);
  end loop;
  insert into public.question_bank_memberships(bank_id,question_id,owner_id)
    select b.id,q.id,teacher from public.questions q join public.question_banks b
      on b.owner_id=teacher and b.collection_unit=q.unit and not b.is_archived and b.id<>source_bank
    where q.owner_id=teacher and q.bank_id=source_bank and q.id in (
      select (v->>'id')::uuid from jsonb_array_elements(p_payload->'questions') v)
    on conflict(bank_id,question_id) do nothing;
  insert into public.catalogue_promotion_batches(import_id,owner_id,component_key,catalogue_ids,payload)
    values(p_import_id,teacher,batch_key,ids,p_payload);
  return jsonb_build_object('inserted',cardinality(ids),'unchanged',0,'componentKey',batch_key);
end;
$$;
create function public.commit_catalogue_component(p_import_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.commit_catalogue_component(p_import_id,p_payload);
$$;
revoke all on function private.commit_catalogue_component(uuid,jsonb),public.commit_catalogue_component(uuid,jsonb) from public,anon;
grant execute on function private.commit_catalogue_component(uuid,jsonb),public.commit_catalogue_component(uuid,jsonb) to authenticated;
