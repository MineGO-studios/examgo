-- A collection must contain either every child of a group or none of them.
create function private.check_group_bank_completeness(p_group_id uuid, p_bank_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  total_children integer;
  present_children integer;
begin
  select count(*), count(m.question_id)
    into total_children, present_children
  from public.question_group_questions child
  left join public.question_bank_memberships m
    on m.question_id = child.question_id and m.bank_id = p_bank_id
    and m.owner_id = child.owner_id
  where child.group_id = p_group_id;
  if present_children > 0 and present_children < total_children then
    raise exception 'Question group membership must be added or removed as a whole.'
      using errcode = '23514';
  end if;
end;
$$;
revoke all on function private.check_group_bank_completeness(uuid,uuid)
  from public, anon, authenticated;

create function private.guard_question_group_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed_question uuid;
  changed_bank uuid;
  linked_group uuid;
begin
  if tg_table_name = 'question_bank_memberships' then
    changed_question := case when tg_op = 'DELETE' then old.question_id else new.question_id end;
    changed_bank := case when tg_op = 'DELETE' then old.bank_id else new.bank_id end;
    for linked_group in select distinct gq.group_id from public.question_group_questions gq
      where gq.question_id = changed_question loop
      perform private.check_group_bank_completeness(linked_group,changed_bank);
    end loop;
  else
    linked_group := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
    for changed_bank in
      select distinct m.bank_id from public.question_group_questions gq
      join public.question_bank_memberships m on m.question_id = gq.question_id
      where gq.group_id = linked_group loop
      perform private.check_group_bank_completeness(linked_group,changed_bank);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.guard_question_group_membership()
  from public, anon, authenticated;

create constraint trigger question_bank_memberships_group_whole
after insert or delete on public.question_bank_memberships
deferrable initially deferred for each row
execute function private.guard_question_group_membership();

create constraint trigger question_group_questions_bank_whole
after insert or update or delete on public.question_group_questions
deferrable initially deferred for each row
execute function private.guard_question_group_membership();

create function public.remove_group_from_bank(p_bank_id uuid, p_group_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  teacher uuid := auth.uid();
  removed integer;
begin
  if teacher is null or not exists (
    select 1 from public.question_banks b
    where b.id = p_bank_id and b.owner_id = teacher and not b.is_archived
  ) or not exists (
    select 1 from public.question_groups g
    where g.id = p_group_id and g.owner_id = teacher
  ) then
    raise exception 'Group or bank is missing or inaccessible.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.question_group_questions gq
    join public.questions q on q.id = gq.question_id and q.owner_id = teacher
    where gq.group_id = p_group_id and q.bank_id = p_bank_id
  ) then
    raise exception 'A source-bank group cannot be removed through membership.' using errcode = '23514';
  end if;
  delete from public.question_bank_memberships m
  where m.bank_id = p_bank_id and m.owner_id = teacher
    and m.question_id in (
      select gq.question_id from public.question_group_questions gq
      where gq.group_id = p_group_id and gq.owner_id = teacher
    );
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.remove_group_from_bank(uuid,uuid) from public, anon;
grant execute on function public.remove_group_from_bank(uuid,uuid) to authenticated;
