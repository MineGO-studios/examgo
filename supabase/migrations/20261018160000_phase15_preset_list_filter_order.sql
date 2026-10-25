-- Phase 15C (MIN-19): apply cheap preset filters before the expensive eligibility checks.
-- Installed in Development 18 October 2026 (remote version 20261018165400) after owner authorization.
--
-- get_eligible_simple_presets evaluated private.preset_question_is_eligible (about 8.5 ms
-- per call, nested definer functions) for every unit-1 simple candidate before the
-- "not in a passage group" filter discarded it. On 18 October 2026 all 1,605 published
-- presets belonged to groups, so each page spent about 2.3 s producing an empty result.
-- The eligibility rules and output are unchanged: the cheap conditions are materialized
-- first and the original functions run only on the remaining candidates. A Development
-- read-only comparison returned identical output (2,271-2,359 ms before, 1.0-2.3 ms after).
-- `create or replace` keeps the existing owner, security definer setting and grants.

create or replace function private.get_eligible_simple_presets(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Read up to 100 presets per page.' using errcode='23514'; end if;
  with candidates as materialized (
    select v.question_id,v.id revision_id,v.revision,r.id curation_id,p.review_version,r.reviewer_name,r.approved_at,
      p.publisher_name,p.published_at,p.public_provenance
    from public.preset_curation r join public.preset_publications p on p.curation_id=r.id
    join public.question_revisions v on v.id=r.question_revision_id
    where (p_after is null or v.question_id>p_after) and v.unit=1
      and v.question_type in ('multiple-choice','binary','short-answer')
      and not exists(select 1 from public.question_group_questions m where m.question_id=v.question_id))
  select coalesce(jsonb_agg(value order by question_id),'[]'::jsonb) into result from (
    select c.question_id,jsonb_build_object('revisionId',c.revision_id,'revision',c.revision,'curationId',c.curation_id,
      'reviewVersion',c.review_version,'reviewer',c.reviewer_name,'approvedAt',c.approved_at,
      'publisher',c.publisher_name,'publishedAt',c.published_at,'provenance',c.public_provenance,
      'question',private.preset_simple_question(c.revision_id,1),'selectionKeys',to_jsonb(private.preset_selection_keys(c.revision_id))) value
    from candidates c
    where private.preset_question_is_eligible(c.revision_id)
      and private.preset_selection_keys(c.revision_id) is not null
    order by c.question_id limit p_limit) page;
  return result;
end;
$$;
