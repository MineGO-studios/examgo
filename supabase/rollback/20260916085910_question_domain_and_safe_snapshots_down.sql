do $$
begin
  if exists (
    select 1
    from public.questions
    where question_type <> 'multiple-choice'
      or current_revision <> 1
      or schema_version <> 1
      or marks <> 1
  ) then
    raise exception
      'Rollback refused: question data no longer fits the Phase 3 MCQ schema.';
  end if;

  if exists (select 1 from public.question_groups)
    or exists (select 1 from public.exam_snapshots) then
    raise exception
      'Rollback refused: group or snapshot data would be lost.';
  end if;

  if exists (
    select 1
    from public.questions
    where options is null
      or correct_option_label is null
      or content -> 'options' is distinct from options
      or answer ->> 'correctOptionLabel'
        is distinct from correct_option_label
  ) then
    raise exception
      'Rollback refused: typed and legacy MCQ payloads do not match.';
  end if;
end;
$$;

drop trigger if exists questions_capture_revision
  on public.questions;
drop trigger if exists questions_prepare_domain
  on public.questions;
drop trigger if exists question_groups_prepare_domain
  on public.question_groups;
drop trigger if exists question_groups_set_updated_at
  on public.question_groups;

drop function if exists private.capture_question_revision();
drop function if exists private.prepare_question_domain();
drop function if exists private.prepare_question_group();

drop table public.exam_snapshot_questions;
drop table public.exam_snapshots;
drop table public.question_group_questions;
drop table public.question_groups;
drop table public.question_revisions;

drop index public.questions_bank_owner_idx;

drop policy questions_owner_access on public.questions;

alter table public.questions
  drop constraint questions_bank_owner_fkey,
  drop constraint questions_id_owner_key,
  drop constraint questions_owner_id_fkey,
  drop constraint questions_schema_version_check,
  drop constraint questions_marks_check,
  drop constraint questions_current_revision_check,
  drop constraint questions_content_envelope_check,
  drop constraint questions_answer_envelope_check,
  drop constraint questions_question_type_check,
  alter column options set not null,
  alter column correct_option_label set not null,
  drop column current_revision,
  drop column answer,
  drop column content,
  drop column marks,
  drop column schema_version,
  drop column owner_id,
  add constraint questions_question_type_check
    check (question_type in ('multiple-choice'));

alter table public.exam_drafts
  drop constraint exam_drafts_id_owner_key;

alter table public.question_banks
  drop constraint question_banks_id_owner_key;

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

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to public;
