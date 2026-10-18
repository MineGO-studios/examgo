-- Phase 10A: one owner-checked transaction saves passage text and ordered children.
-- Existing Phase 9 drafts and snapshots are not changed.
begin;

create function private.save_passage_group(
  p_id uuid,
  p_expected_revision integer,
  p_bank_id uuid,
  p_title text,
  p_instruction text,
  p_arabic_instruction text,
  p_passage text,
  p_attempt_count integer,
  p_expected_marks integer,
  p_question_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  teacher uuid := auth.uid();
  saved public.question_groups%rowtype;
  question_row public.questions%rowtype;
  content_value jsonb;
  old_ids uuid[];
  total_marks integer := 0;
  first_mark integer;
  item_count integer;
  item_index integer;
begin
  item_count := coalesce(array_length(p_question_ids, 1), 0);
  if teacher is null or p_id is null or p_bank_id is null then
    raise exception 'An authenticated passage identity is required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or item_count not between 1 and 100
    or p_attempt_count not between 1 and item_count
    or p_expected_marks not between 1 and 1000
    or p_instruction is null or char_length(btrim(p_instruction)) < 1 or char_length(p_instruction) > 1000
    or p_passage is null or char_length(btrim(p_passage)) < 1 or char_length(p_passage) > 5000
    or (p_title is not null and (char_length(btrim(p_title)) < 1 or char_length(p_title) > 200))
    or (p_arabic_instruction is not null and (char_length(btrim(p_arabic_instruction)) < 1 or char_length(p_arabic_instruction) > 1000))
    or array_position(p_question_ids, null) is not null
    or (select count(distinct id) from unnest(p_question_ids) id) <> item_count then
    raise exception 'Passage content, count, marks or child identities are invalid.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.question_banks
    where id = p_bank_id and owner_id = teacher and not is_archived
  ) then
    raise exception 'Question bank is not accessible.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(teacher::text || ':' || p_id::text, 0));
  select * into saved from public.question_groups where id = p_id for update;
  if found and (saved.owner_id <> teacher or saved.group_type <> 'passage'
    or saved.parent_group_id is not null) then
    raise exception 'Passage is not accessible.' using errcode = '42501';
  end if;

  -- Lock selected questions in a stable order before validating current content.
  perform 1 from public.questions q
    where q.id = any(p_question_ids) and q.owner_id = teacher
    order by q.id for share;
  for item_index in 1..item_count loop
    select * into question_row from public.questions
      where id = p_question_ids[item_index] and owner_id = teacher;
    if not found or question_row.bank_id <> p_bank_id then
      raise exception 'A passage child is not in the owned bank.' using errcode = '42501';
    end if;
    if not question_row.is_active or question_row.question_type = 'matching' then
      raise exception 'A passage child is inactive or has an unsupported type.' using errcode = '23514';
    end if;
    if p_attempt_count < item_count then
      if first_mark is null then first_mark := question_row.marks;
      elsif first_mark <> question_row.marks then
        raise exception 'Optional passage children must carry equal marks.' using errcode = '23514';
      end if;
    else
      total_marks := total_marks + question_row.marks;
    end if;
  end loop;
  if p_attempt_count < item_count then total_marks := first_mark * p_attempt_count; end if;
  if total_marks <> p_expected_marks then
    raise exception 'Passage marks disagree with attempted child marks.' using errcode = '23514';
  end if;

  content_value := jsonb_build_object(
    'type', 'passage', 'schemaVersion', 1, 'bankId', p_bank_id,
    'text', p_passage, 'arabicInstruction', p_arabic_instruction,
    'childIds', to_jsonb(p_question_ids)
  );
  if saved.id is not null then
    select coalesce(array_agg(question_id order by position), '{}'::uuid[])
      into old_ids from public.question_group_questions where group_id = p_id;
    if saved.revision <> p_expected_revision then
      if saved.revision = p_expected_revision + 1
        and saved.content = content_value and saved.title is not distinct from p_title
        and saved.instructions = p_instruction
        and saved.attempt_count = p_attempt_count
        and saved.expected_marks = p_expected_marks
        and old_ids = p_question_ids then
        return jsonb_build_object('id', saved.id, 'revision', saved.revision);
      end if;
      raise exception 'Passage changed before save.' using errcode = 'PT409';
    end if;
    if saved.content is distinct from content_value
      or saved.title is distinct from p_title
      or saved.instructions is distinct from p_instruction
      or saved.attempt_count is distinct from p_attempt_count
      or saved.expected_marks is distinct from p_expected_marks
      or old_ids is distinct from p_question_ids then
      update public.question_groups set title = p_title, instructions = p_instruction,
        content = content_value, attempt_count = p_attempt_count,
        expected_marks = p_expected_marks where id = p_id returning * into saved;
      delete from public.question_group_questions where group_id = p_id;
      for item_index in 1..item_count loop
        insert into public.question_group_questions(group_id, question_id, owner_id, position)
          values (p_id, p_question_ids[item_index], teacher, item_index);
      end loop;
    end if;
  else
    if p_expected_revision <> 0 then
      raise exception 'Passage is missing or stale.' using errcode = 'PT409';
    end if;
    insert into public.question_groups(
      id, owner_id, group_type, schema_version, parent_group_id, position,
      title, instructions, content, attempt_count, expected_marks
    ) values (
      p_id, teacher, 'passage', 1, null, null,
      p_title, p_instruction, content_value, p_attempt_count, p_expected_marks
    ) returning * into saved;
    for item_index in 1..item_count loop
      insert into public.question_group_questions(group_id, question_id, owner_id, position)
        values (p_id, p_question_ids[item_index], teacher, item_index);
    end loop;
  end if;
  return jsonb_build_object('id', saved.id, 'revision', saved.revision);
end;
$$;

create function public.save_passage_group(
  p_id uuid,
  p_expected_revision integer,
  p_bank_id uuid,
  p_title text,
  p_instruction text,
  p_arabic_instruction text,
  p_passage text,
  p_attempt_count integer,
  p_expected_marks integer,
  p_question_ids uuid[]
) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.save_passage_group(
    p_id, p_expected_revision, p_bank_id, p_title, p_instruction,
    p_arabic_instruction, p_passage, p_attempt_count, p_expected_marks,
    p_question_ids
  );
$$;

revoke insert, update, delete on public.question_groups, public.question_group_questions from authenticated;
revoke all on function private.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[]),
  public.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[])
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[]),
  public.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[])
  to authenticated;

commit;
