-- Disposable/authorized rollback of the Phase 10A passage authoring boundary.
-- Restore only the direct authenticated grants that existed before this migration.
begin;
drop function if exists public.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[]);
drop function if exists private.save_passage_group(uuid,integer,uuid,text,text,text,text,integer,integer,uuid[]);
grant insert, update, delete on public.question_groups, public.question_group_questions to authenticated;
commit;
