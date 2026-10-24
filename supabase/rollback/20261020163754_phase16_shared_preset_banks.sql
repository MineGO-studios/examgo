begin;
drop function if exists public.get_preset_bank_questions(uuid,uuid,integer,text);
drop function if exists public.get_preset_banks(uuid,integer);
drop function if exists private.shared_preset_revisions();
commit;
