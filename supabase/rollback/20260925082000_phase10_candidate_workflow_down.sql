-- Refuse to remove candidate workflow support while candidate data exists.
begin;
do $$ begin
  if exists (select 1 from public.exam_drafts where workflow->>'profileId'='exam-002-structural-v1-candidate')
    or exists (select 1 from public.exam_snapshots where workflow->>'profileId'='exam-002-structural-v1-candidate') then
    raise exception 'Candidate drafts or snapshots must be preserved; rollback refused.' using errcode='P0001';
  end if;
end $$;

drop function public.get_phase_ten_candidate_workflows();
drop function public.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb);
drop function public.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb);
drop function private.finalize_phase_ten_candidate(uuid,uuid,integer,jsonb);
drop function private.save_phase_ten_candidate_draft(uuid,integer,uuid,jsonb);
drop function private.validate_phase_ten_candidate(jsonb);
drop trigger exam_drafts_guard_workflow_profile on public.exam_drafts;
drop function private.guard_structured_workflow_profile();

create or replace function public.get_phase_nine_workflows()
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(rowdata order by saved_at desc),'[]'::jsonb) from (
    select updated_at saved_at,jsonb_build_object('id',id,'version',workflow_version,'finalized',false,'savedAt',updated_at,'workflow',workflow) rowdata
      from public.exam_drafts where owner_id=auth.uid() and workflow is not null
    union all
    select created_at,jsonb_build_object('id',id,'version',1,'finalized',true,'savedAt',created_at,'workflow',workflow)
      from public.exam_snapshots where owner_id=auth.uid() and workflow is not null
  ) records;
$$;

create or replace function private.check_complete_exam_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.exam_snapshots%rowtype; child_count integer; canonical_count integer;
begin
  select * into s from public.exam_snapshots where id=new.id;
  if s.workflow is null then return null; end if;
  select count(*),count(distinct r.question_id) into child_count,canonical_count
    from public.exam_snapshot_questions c join public.question_revisions r on r.id=c.question_revision_id where c.snapshot_id=s.id;
  if not s.sealed or child_count <> 16 or canonical_count <> 16
    or s.total_marks <> 60 or s.source_draft_version is null or s.request_id is null then
    raise exception 'Structured snapshot must be complete and sealed before commit.' using errcode='23514';
  end if;
  return null;
end;
$$;
commit;
