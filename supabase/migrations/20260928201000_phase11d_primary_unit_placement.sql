-- Preserve all original unit tags, but place a staged question in only its
-- highest-tag Unit collection. The source Mid-Year bank always retains it.
create or replace view public.catalogue_staging_bank_rows
with (security_invoker = true) as
select r.import_id, r.catalogue_id, i.source_bank_id as bank_id,
  r.owner_id, r.display_unit, r.unit_tags, r.selection_marks, r.provisional_difficulty
from public.catalogue_import_rows r
join public.catalogue_imports i on i.id = r.import_id and i.owner_id = r.owner_id
union all
select r.import_id, r.catalogue_id, b.id as bank_id,
  r.owner_id, r.display_unit, r.unit_tags, r.selection_marks, r.provisional_difficulty
from public.catalogue_import_rows r
join public.catalogue_imports i on i.id = r.import_id and i.owner_id = r.owner_id
join public.question_banks b on b.owner_id = r.owner_id
  and b.collection_unit = r.display_unit
  and b.id <> i.source_bank_id and not b.is_archived;

revoke all on public.catalogue_staging_bank_rows from public, anon, authenticated;
grant select on public.catalogue_staging_bank_rows to authenticated;

-- Imported source groups stay complete in Mid-Year. Unit collections may
-- regroup individual questions by their primary unit without claiming a
-- partial subset is the original source group. Authored groups remain whole.
create or replace function private.check_group_bank_completeness(p_group_id uuid, p_bank_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  total_children integer;
  present_children integer;
begin
  if exists (
    select 1 from public.question_groups g
    join public.question_banks b on b.id = p_bank_id and b.owner_id = g.owner_id
    where g.id = p_group_id and g.content ? 'sourceGroupType'
      and b.collection_unit is not null
  ) then
    return;
  end if;

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
