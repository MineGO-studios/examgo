-- Rollback for 20261018120000_phase15_jsonb_content_limits.sql: remove the content-limit constraints and validator.
-- Run only with separate owner authorization. Stored rows are not modified; no privileges are broadened.

alter table public.catalogue_import_rows
  drop constraint if exists catalogue_import_rows_normalized_limits,
  drop constraint if exists catalogue_import_rows_source_fields_limits;
alter table public.exam_draft_questions drop constraint if exists exam_draft_questions_point_marks_limits;
alter table public.exam_drafts drop constraint if exists exam_drafts_workflow_limits;
alter table public.question_groups drop constraint if exists question_groups_content_limits;
alter table public.questions
  drop constraint if exists questions_options_limits,
  drop constraint if exists questions_answer_limits,
  drop constraint if exists questions_content_limits;

drop function if exists public.jsonb_within_limits(jsonb, integer, integer);
