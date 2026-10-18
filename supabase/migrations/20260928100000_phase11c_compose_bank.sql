-- One transaction creates a reusable collection of references, never copies.
create function public.create_bank_from_banks(p_name text, p_source_bank_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  teacher uuid := auth.uid();
  result uuid;
begin
  if teacher is null then
    raise exception 'Sign in before creating a collection.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100
    or p_source_bank_ids is null or cardinality(p_source_bank_ids) not between 1 and 20
    or array_position(p_source_bank_ids, null) is not null
    or (select count(distinct id) from unnest(p_source_bank_ids) ids(id)) <> cardinality(p_source_bank_ids) then
    raise exception 'A valid name and one to 20 distinct source banks are required.' using errcode = '23514';
  end if;
  if (select count(*) from public.question_banks b
      where b.id = any(p_source_bank_ids) and b.owner_id = teacher and not b.is_archived)
      <> cardinality(p_source_bank_ids) then
    raise exception 'A source bank is missing, archived or inaccessible.' using errcode = '42501';
  end if;

  insert into public.question_banks(owner_id, name, grade, subject, curriculum)
  values (teacher, btrim(p_name), 6, 'English', 'Iraqi mainstream')
  returning id into result;

  insert into public.question_bank_memberships(bank_id, question_id, owner_id)
  select result, m.question_id, teacher
  from public.question_bank_memberships m
  where m.bank_id = any(p_source_bank_ids) and m.owner_id = teacher
  group by m.question_id;
  return result;
end;
$$;

revoke all on function public.create_bank_from_banks(text, uuid[]) from public, anon;
grant execute on function public.create_bank_from_banks(text, uuid[]) to authenticated;
