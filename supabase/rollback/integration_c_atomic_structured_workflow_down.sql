-- PREPARED ONLY. Authorization and disposable rehearsal are required.
-- Refuses to delete any structured draft/finalized data. Keeps the legacy
-- snapshot insert gap CLOSED: restoring unsafe direct inserts is not recovery.
begin;
do $$ begin
  if exists(select 1 from public.exam_drafts where workflow is not null)
    or exists(select 1 from public.exam_snapshots where workflow is not null or sealed) then
    raise exception 'Rollback refused: preserve and export structured drafts/snapshots; use a forward repair.';
  end if;
end $$;
drop function public.get_phase_nine_workflows();
drop function public.finalize_phase_nine_exam(uuid,uuid,integer,jsonb);
drop function public.save_phase_nine_draft(uuid,integer,uuid,jsonb);
drop function private.finalize_phase_nine_exam(uuid,uuid,integer,jsonb);
drop function private.save_phase_nine_draft(uuid,integer,uuid,jsonb);
drop function private.validate_phase_nine_workflow(jsonb);
drop trigger exam_snapshot_questions_guard_seal on public.exam_snapshot_questions;
drop trigger exam_snapshots_guard_seal on public.exam_snapshots;
drop trigger exam_snapshots_require_complete on public.exam_snapshots;
drop function private.guard_sealed_exam_snapshot();
drop function private.check_complete_exam_snapshot();
drop policy exam_draft_questions_owner_read on public.exam_draft_questions;
drop policy exam_draft_questions_legacy_write on public.exam_draft_questions;
drop policy exam_drafts_owner_read on public.exam_drafts;
drop policy exam_drafts_legacy_insert on public.exam_drafts;
drop policy exam_drafts_legacy_update on public.exam_drafts;
drop policy exam_drafts_legacy_delete on public.exam_drafts;
create policy exam_drafts_owner_access on public.exam_drafts for all to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.question_banks b where b.id=bank_id and b.owner_id=(select auth.uid())))
  with check (owner_id=(select auth.uid()) and exists(select 1 from public.question_banks b where b.id=bank_id and b.owner_id=(select auth.uid())));
create policy exam_draft_questions_owner_access on public.exam_draft_questions for all to authenticated
  using (exists(select 1 from public.exam_drafts d join public.questions q on q.id=question_id where d.id=exam_draft_id and d.owner_id=(select auth.uid()) and q.bank_id=d.bank_id))
  with check (exists(select 1 from public.exam_drafts d join public.questions q on q.id=question_id where d.id=exam_draft_id and d.owner_id=(select auth.uid()) and q.bank_id=d.bank_id));
alter table public.exam_drafts drop column workflow,drop column workflow_version,drop column workflow_request_id;
drop index public.exam_snapshots_owner_request_key;
drop index public.exam_snapshots_draft_version_key;
alter table public.exam_snapshots drop column workflow,drop column request_id,drop column source_draft_version,drop column sealed;
-- No default privilege changes, grants to anon/PUBLIC, or historical rollback.
commit;
