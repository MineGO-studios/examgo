-- Phase 15A (MIN-19): bound nested JSON content at the shared table boundary.
-- Installed in Development 18 October 2026 (remote version 20261018092845) after owner authorization.
--
-- Teacher-writable JSONB columns had envelope checks but no size or nested text
-- bounds, so direct authenticated writes could store arbitrarily large documents.
-- Each constraint bounds serialized size (UTF-8 bytes of the jsonb text form) and
-- the character length of every string anywhere in the document. Limits sit well
-- above the 18 October 2026 Development maxima (aggregate-only preflight):
--   questions content 771 B / longest string 191; answer 426 B / 353; options 129 B / 26
--   question_groups.content 2,636 B / 1,221; exam_drafts.workflow 35,822 B / 474
--   catalogue_import_rows source_fields 52,214 B and normalized 53,399 B / 37,137
-- Constraints are added NOT VALID and then validated, so existing rows are checked
-- without being rewritten; any violating row aborts the whole migration unchanged.
-- Question strings match the editor and prompt cap (2,000); passages match the editor (5,000);
-- staged raw source fields match the client intake cap (100,000).
-- Historical question_revisions and sealed snapshots are deliberately not constrained.

create function public.jsonb_within_limits(doc jsonb, max_bytes integer, max_text integer)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select doc is null or (
    octet_length(doc::text) <= max_bytes
    and not exists (
      select 1 from jsonb_path_query(doc, 'strict $.** ? (@.type() == "string")') as leaf(value)
      where char_length(leaf.value #>> '{}') > max_text))
$$;

comment on function public.jsonb_within_limits(jsonb, integer, integer) is
  'Phase 15A: true when a JSON document is within a UTF-8 byte cap and every string is within a character cap.';

revoke all on function public.jsonb_within_limits(jsonb, integer, integer) from public, anon;
grant execute on function public.jsonb_within_limits(jsonb, integer, integer) to authenticated, service_role;

alter table public.questions
  add constraint questions_content_limits check (public.jsonb_within_limits(content, 32768, 2000)) not valid,
  add constraint questions_answer_limits check (public.jsonb_within_limits(answer, 32768, 2000)) not valid,
  add constraint questions_options_limits check (public.jsonb_within_limits(options, 16384, 2000)) not valid;

alter table public.question_groups
  add constraint question_groups_content_limits check (public.jsonb_within_limits(content, 65536, 5000)) not valid;

alter table public.exam_drafts
  add constraint exam_drafts_workflow_limits check (public.jsonb_within_limits(workflow, 524288, 5000)) not valid;

alter table public.exam_draft_questions
  add constraint exam_draft_questions_point_marks_limits check (public.jsonb_within_limits(point_marks, 4096, 200)) not valid;

alter table public.catalogue_import_rows
  add constraint catalogue_import_rows_source_fields_limits check (public.jsonb_within_limits(source_fields, 262144, 100000)) not valid,
  add constraint catalogue_import_rows_normalized_limits check (public.jsonb_within_limits(normalized, 262144, 100000)) not valid;

alter table public.questions validate constraint questions_content_limits;
alter table public.questions validate constraint questions_answer_limits;
alter table public.questions validate constraint questions_options_limits;
alter table public.question_groups validate constraint question_groups_content_limits;
alter table public.exam_drafts validate constraint exam_drafts_workflow_limits;
alter table public.exam_draft_questions validate constraint exam_draft_questions_point_marks_limits;
alter table public.catalogue_import_rows validate constraint catalogue_import_rows_source_fields_limits;
alter table public.catalogue_import_rows validate constraint catalogue_import_rows_normalized_limits;
