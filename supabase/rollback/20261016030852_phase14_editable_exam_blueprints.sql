-- Disable only the Phase 14 editable blueprint API. Keep saved exam_drafts rows.
-- Read-only owner access to saved rows remains governed by existing RLS.
-- Never run automatically or against Production without explicit authorization.
begin;
drop function public.get_exam_blueprints(timestamptz,uuid,integer);
drop function public.save_exam_blueprint(uuid,integer,uuid,jsonb);
drop function private.save_exam_blueprint(uuid,integer,uuid,jsonb);
drop function private.validate_exam_blueprint_intent(jsonb);
drop function private.blueprint_integer(jsonb,bigint,bigint);
commit;
