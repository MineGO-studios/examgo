-- MIN-49 follow-up: narrow reads for preset provenance intake preparation (owner request, 19 October 2026).
-- Installed in Development 19 October 2026 (remote version 20261019084701) after owner authorization.
--
-- prepareCataloguePresetProvenance used get_preset_curation, which builds every record, its history
-- and per-record eligibility (about 9 MB and 11 s for the 1,605-question Mid-Year bank). Preparation
-- only needs reviewer status, the current revisions of the converted questions and any existing
-- record for each revision. This returns exactly that. Scope, order and authorization match
-- get_preset_curation_base: the caller must own the bank; private notes stay reviewer-only.

create function private.get_preset_intake_candidates(p_bank_id uuid, p_question_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reviewer text := private.preset_reviewer_name(); candidates jsonb;
begin
  if actor is null or not exists(select 1 from public.question_banks where id=p_bank_id and owner_id=actor) then
    raise exception 'Bank is inaccessible.' using errcode='42501'; end if;
  if p_question_ids is null or cardinality(p_question_ids) not between 1 and 10000 or array_position(p_question_ids, null) is not null then
    raise exception 'Prepare one to 10,000 questions.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('revisionId',v.id,'questionId',v.question_id,'externalId',v.external_id,
      'revision',v.revision,'record',(
        select jsonb_build_object('id',r.id,'provenance',r.provenance,
          'privateNotes',case when reviewer is not null then r.private_source_notes else null end)
        from public.preset_curation r
        where r.question_revision_id=v.id and (r.bank_id=p_bank_id or r.owner_id=actor)
        order by r.created_at, r.id limit 1)) order by v.external_id, v.id),'[]'::jsonb)
    into candidates
  from public.question_bank_memberships m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
  where m.bank_id=p_bank_id and q.owner_id=actor and q.is_active and q.id=any(p_question_ids);
  return jsonb_build_object('reviewer',reviewer,'candidates',candidates);
end;
$$;

create function public.get_preset_intake_candidates(p_bank_id uuid, p_question_ids uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_preset_intake_candidates(p_bank_id, p_question_ids);
$$;

revoke all on function private.get_preset_intake_candidates(uuid,uuid[]),public.get_preset_intake_candidates(uuid,uuid[])
  from public,anon,authenticated;
grant execute on function private.get_preset_intake_candidates(uuid,uuid[]),public.get_preset_intake_candidates(uuid,uuid[])
  to authenticated;
