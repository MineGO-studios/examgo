-- Owner request 19 October 2026 (after Phase 15): load a bank's question pool in one call.
-- Installed in Development 19 October 2026 (remote version 20261019075937) after owner authorization.
--
-- The builder loaded a 1,605-question bank with about 70 requests (membership pages,
-- 33 question batches, 33 passage-membership lookups). With a ~470 ms round trip to the
-- database region that took 5.2-5.8 s. This function returns the same pool in one
-- response, applying the active and "not a passage child" filters in the database.
-- It runs as the invoker, so existing row-level security still decides visibility.
-- A read-only Development comparison returned identical question sets in all four
-- filter combinations (database time 73-116 ms for 1,605 questions).

create function public.get_bank_question_pool(p_bank_ids uuid[], p_active_only boolean default false, p_standalone_only boolean default false)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  requested uuid[];
  visible_banks integer;
  bank_owners integer;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to load question banks.' using errcode = '42501'; end if;
  if p_bank_ids is null or cardinality(p_bank_ids) not between 1 and 20 or array_position(p_bank_ids, null) is not null then
    raise exception 'Select between one and 20 valid question banks.' using errcode = '23514';
  end if;
  requested := array(select distinct unnest(p_bank_ids));
  -- Row-level security limits this to the caller's own banks.
  select count(*), count(distinct b.owner_id) into visible_banks, bank_owners
  from public.question_banks b where b.id = any(requested) and not b.is_archived;
  if visible_banks <> cardinality(requested) or bank_owners <> 1 then
    raise exception 'A selected question bank is missing, archived or inaccessible.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.id), '[]'::jsonb) into result
  from public.questions q
  where q.id in (select m.question_id from public.question_bank_memberships m where m.bank_id = any(requested))
    and (not coalesce(p_active_only, false) or q.is_active)
    and (not coalesce(p_standalone_only, false) or not exists (
      select 1 from public.question_group_questions g join public.question_groups pg on pg.id = g.group_id
      where g.question_id = q.id and pg.group_type = 'passage'));
  return result;
end
$$;

comment on function public.get_bank_question_pool(uuid[], boolean, boolean) is
  'Returns the caller''s questions for 1-20 owned, active banks in one response, optionally active-only and/or excluding passage children.';
revoke all on function public.get_bank_question_pool(uuid[], boolean, boolean) from public, anon;
grant execute on function public.get_bank_question_pool(uuid[], boolean, boolean) to authenticated, service_role;
