-- Rollback for 20261018160000_phase15_preset_list_filter_order.sql: restore the
-- 20261003141000_phase12_preset_variety body. Run only with separate owner authorization.
-- No data is modified; `create or replace` keeps the owner, definer setting and grants.

create or replace function private.get_eligible_simple_presets(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Read up to 100 presets per page.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(value order by question_id),'[]'::jsonb) into result from (
    select v.question_id,jsonb_build_object('revisionId',v.id,'revision',v.revision,'curationId',r.id,
      'reviewVersion',p.review_version,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,
      'publisher',p.publisher_name,'publishedAt',p.published_at,'provenance',p.public_provenance,
      'question',private.preset_simple_question(v.id,1),'selectionKeys',to_jsonb(private.preset_selection_keys(v.id))) value
    from public.preset_curation r join public.preset_publications p on p.curation_id=r.id
    join public.question_revisions v on v.id=r.question_revision_id
    where (p_after is null or v.question_id>p_after) and v.unit=1
      and v.question_type in ('multiple-choice','binary','short-answer') and private.preset_question_is_eligible(v.id)
      and private.preset_selection_keys(v.id) is not null
      and not exists(select 1 from public.question_group_questions m where m.question_id=v.question_id)
    order by v.question_id limit p_limit) page;
  return result;
end;
$$;
