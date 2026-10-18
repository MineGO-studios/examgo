-- Preserve one-bank structured workflows; let legacy simple drafts keep
-- their exact set of selected, same-owner collection banks.
alter table public.exam_drafts add column bank_ids uuid[];
update public.exam_drafts set bank_ids = array[bank_id];
alter table public.exam_drafts
  add constraint exam_drafts_bank_ids_check check (
    bank_ids is null or (
      cardinality(bank_ids) between 1 and 20
      and bank_ids[1] = bank_id
      and array_position(bank_ids, null) is null
    )
  );

create function private.prepare_exam_draft_bank_ids()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.bank_ids is null then new.bank_ids := array[new.bank_id]; end if;
  return new;
end;
$$;
revoke all on function private.prepare_exam_draft_bank_ids()
from public, anon, authenticated;
create trigger exam_drafts_prepare_bank_ids
before insert or update on public.exam_drafts
for each row execute function private.prepare_exam_draft_bank_ids();

drop policy exam_drafts_legacy_insert on public.exam_drafts;
create policy exam_drafts_legacy_insert on public.exam_drafts for insert to authenticated
with check (
  workflow is null and workflow_version = 0 and workflow_request_id is null
  and owner_id = (select auth.uid())
  and bank_ids is not null and bank_id = bank_ids[1]
  and not exists (
    select 1 from unnest(bank_ids) selected(id)
    left join public.question_banks b on b.id = selected.id
      and b.owner_id = (select auth.uid()) and not b.is_archived
    where b.id is null
  )
);

drop policy exam_drafts_legacy_update on public.exam_drafts;
create policy exam_drafts_legacy_update on public.exam_drafts for update to authenticated
using (workflow is null and owner_id = (select auth.uid()))
with check (
  workflow is null and workflow_version = 0 and workflow_request_id is null
  and owner_id = (select auth.uid())
  and bank_ids is not null and bank_id = bank_ids[1]
  and not exists (
    select 1 from unnest(bank_ids) selected(id)
    left join public.question_banks b on b.id = selected.id
      and b.owner_id = (select auth.uid()) and not b.is_archived
    where b.id is null
  )
);

drop policy exam_draft_questions_legacy_write on public.exam_draft_questions;
create policy exam_draft_questions_legacy_write
on public.exam_draft_questions for all to authenticated
using (exists (
  select 1 from public.exam_drafts d
  where d.id = exam_draft_id and d.owner_id = (select auth.uid()) and d.workflow is null
))
with check (exists (
  select 1 from public.exam_drafts d
  join public.questions q on q.id = question_id and q.owner_id = d.owner_id
  join public.question_bank_memberships m on m.question_id = q.id
    and m.owner_id = d.owner_id and m.bank_id = any(d.bank_ids)
  where d.id = exam_draft_id and d.owner_id = (select auth.uid()) and d.workflow is null
));
