-- Rollback for 20261019120000_preset_curation_view.sql. The legacy get_preset_curation is untouched.
drop function if exists public.get_preset_curation_view(uuid,text,uuid,integer,integer);
drop function if exists public.get_preset_provenance_readback(uuid,uuid[]);
drop function if exists private.get_preset_curation_view(uuid,text,uuid,integer,integer);
drop function if exists private.get_preset_provenance_readback(uuid,uuid[]);
drop function if exists private.preset_curation_record_json(uuid,text);
