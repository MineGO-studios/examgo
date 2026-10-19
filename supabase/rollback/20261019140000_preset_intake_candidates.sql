-- Rollback for 20261019140000_preset_intake_candidates.sql. The legacy get_preset_curation is untouched.
drop function if exists public.get_preset_intake_candidates(uuid,uuid[]);
drop function if exists private.get_preset_intake_candidates(uuid,uuid[]);
