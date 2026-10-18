-- Sixth Primary English has Units 1–8. Existing development rows have been
-- checked for out-of-range values before applying these tighter constraints.
alter table public.questions
  drop constraint questions_unit_check,
  add constraint questions_unit_check check (unit between 1 and 8);

alter table public.question_revisions
  drop constraint question_revisions_unit_check,
  add constraint question_revisions_unit_check check (unit between 1 and 8);

alter table public.exam_drafts
  drop constraint exam_drafts_unit_check,
  add constraint exam_drafts_unit_check check (unit between 1 and 8);

alter table public.question_banks
  drop constraint question_banks_collection_unit_check,
  add constraint question_banks_collection_unit_check
    check (collection_unit between 1 and 8);
