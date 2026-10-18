-- Rollback for 20261018140000_phase15_owner_quotas.sql: remove per-teacher limits.
-- Run only with separate owner authorization. Stored rows are not modified; no privileges are broadened.

drop trigger if exists catalogue_imports_owner_quota on public.catalogue_imports;
drop trigger if exists exam_snapshots_owner_quota on public.exam_snapshots;
drop trigger if exists exam_drafts_owner_quota on public.exam_drafts;
drop trigger if exists questions_owner_quota on public.questions;
drop trigger if exists question_banks_owner_quota on public.question_banks;
drop function if exists private.enforce_owner_quota();
drop table if exists private.owner_quota_limits;
drop index if exists public.catalogue_imports_owner_created_idx;
drop index if exists public.exam_snapshots_owner_created_idx;
