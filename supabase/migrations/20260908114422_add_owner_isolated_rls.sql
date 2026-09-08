alter table public.question_banks
  alter column owner_id set default auth.uid();

alter table public.exam_drafts
  alter column owner_id set default auth.uid();

revoke all on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
from anon, authenticated;

grant select, insert, update, delete on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
to authenticated;

create policy question_banks_owner_access
on public.question_banks
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy questions_owner_access
on public.questions
for all
to authenticated
using (
  exists (
    select 1
    from public.question_banks as bank
    where bank.id = questions.bank_id
      and bank.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.question_banks as bank
    where bank.id = questions.bank_id
      and bank.owner_id = (select auth.uid())
  )
);

create policy exam_drafts_owner_access
on public.exam_drafts
for all
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.question_banks as bank
    where bank.id = exam_drafts.bank_id
      and bank.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.question_banks as bank
    where bank.id = exam_drafts.bank_id
      and bank.owner_id = (select auth.uid())
  )
);

create policy exam_draft_questions_owner_access
on public.exam_draft_questions
for all
to authenticated
using (
  exists (
    select 1
    from public.exam_drafts as draft
    join public.questions as question
      on question.id =
        exam_draft_questions.question_id
    where draft.id =
        exam_draft_questions.exam_draft_id
      and draft.owner_id = (select auth.uid())
      and question.bank_id = draft.bank_id
  )
)
with check (
  exists (
    select 1
    from public.exam_drafts as draft
    join public.questions as question
      on question.id =
        exam_draft_questions.question_id
    where draft.id =
        exam_draft_questions.exam_draft_id
      and draft.owner_id = (select auth.uid())
      and question.bank_id = draft.bank_id
  )
);