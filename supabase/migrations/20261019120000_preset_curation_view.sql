-- MIN-49: paged, on-demand preset curation reads (owner request, 19 October 2026).
-- Installed in Development 19 October 2026 (remote version 20261019080023) after owner authorization.
-- get_preset_curation builds every record, its full history and per-record eligibility in one
-- response. For the 1,605-publication Mid-Year bank that is about 9 MB of record JSON and
-- about 11 s of eligibility checks, which exceeds the statement timeout.
-- These functions return only one searched page (eligibility for the page only), the bank
-- record and the selected question, plus a narrow provenance readback for governed intake.
-- Authorization is unchanged: the caller must own the bank; private notes stay reviewer-only.
-- The legacy get_preset_curation function is kept for compatibility.

create function private.preset_curation_record_json(p_id uuid, p_reviewer text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',r.id,'bankId',r.bank_id,'revisionId',r.question_revision_id,
    'version',r.version,'state',r.state,'provenance',r.provenance,'reviewer',r.reviewer_name,'approvedAt',r.approved_at,
    'privateNotes',case when p_reviewer is not null then r.private_source_notes else null end,
    'unit',v.unit,'lesson',v.lesson,'prompt',v.prompt,'currentRevision',q.current_revision,'sourceRevision',v.revision,
    'published',p.curation_id is not null,
    'publication',case when p.curation_id is null then null else jsonb_build_object('reviewVersion',p.review_version,
      'publisher',p.publisher_name,'publishedAt',p.published_at,'publicProvenance',p.public_provenance,
      'eligible',private.preset_question_is_eligible(r.question_revision_id)) end,
    'history',(select coalesce(jsonb_agg(jsonb_build_object('version',h.version,'state',h.state,
      'actor',h.actor_name,'reason',h.reason,'provenance',h.provenance,
      'privateNotes',case when p_reviewer is not null then h.private_source_notes else null end,
      'createdAt',h.created_at) order by h.version),'[]'::jsonb)
      from public.preset_curation_history h where h.curation_id=r.id))
  from public.preset_curation r left join public.question_revisions v on v.id=r.question_revision_id
    left join public.questions q on q.id=v.question_id
    left join public.preset_publications p on p.curation_id=r.id
  where r.id=p_id;
$$;

create function private.get_preset_curation_view(p_bank_id uuid, p_search text, p_revision_id uuid,
  p_record_limit integer, p_target_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reviewer text := private.preset_reviewer_name(); needle text := lower(coalesce(p_search,''));
  record_ids uuid[]; record_count integer; bank_record uuid; selected_record uuid;
  targets jsonb; target_count integer; selected_target jsonb;
begin
  if actor is null or not exists(select 1 from public.question_banks where id=p_bank_id and owner_id=actor) then
    raise exception 'Bank is inaccessible.' using errcode='42501'; end if;
  if length(needle)>200 or p_record_limit is null or p_record_limit not between 0 and 100
    or p_target_limit is null or p_target_limit not between 0 and 200 then
    raise exception 'Use a search up to 200 characters and bounded page sizes.' using errcode='23514'; end if;

  -- Same record scope and order as get_preset_curation_base.
  with scoped as (
    select r.id, r.bank_id, r.question_revision_id, r.created_at, v.prompt, r.provenance
    from public.preset_curation r left join public.question_revisions v on v.id=r.question_revision_id
    where r.bank_id=p_bank_id or (r.owner_id=actor and exists(select 1 from public.question_bank_memberships m
      where m.bank_id=p_bank_id and m.question_id=v.question_id))
  ), matched as (
    select s.id, row_number() over (order by s.created_at, s.id) n, count(*) over () total from scoped s
    where strpos(lower(coalesce(s.prompt,'Bank')||' '||coalesce(s.provenance->>'sourceReference','')), needle)>0
  )
  select coalesce(array_agg(id order by n) filter (where n<=p_record_limit),'{}'), coalesce(max(total),0)
    into record_ids, record_count from matched;
  with scoped as (
    select r.id, r.bank_id, r.question_revision_id, r.created_at
    from public.preset_curation r left join public.question_revisions v on v.id=r.question_revision_id
    where r.bank_id=p_bank_id or (r.owner_id=actor and exists(select 1 from public.question_bank_memberships m
      where m.bank_id=p_bank_id and m.question_id=v.question_id))
  )
  select (select id from scoped where bank_id=p_bank_id and question_revision_id is null order by created_at, id limit 1),
    (select id from scoped where p_revision_id is not null and question_revision_id=p_revision_id order by created_at, id limit 1)
    into bank_record, selected_record;

  -- Same target scope and order as get_preset_curation_base: the caller's active current revisions.
  with current_targets as (
    select v.id, v.bank_id, v.external_id, v.question_id, v.revision, v.unit, v.lesson, v.prompt, v.content, v.answer
    from public.question_bank_memberships m join public.questions q on q.id=m.question_id
      join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.bank_id=p_bank_id and q.owner_id=actor and q.is_active
  ), matched as (
    select t.*, row_number() over (order by t.external_id, t.id) n, count(*) over () total from current_targets t
    where strpos(lower(t.external_id||' '||t.prompt), needle)>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('revisionId',id,'bankId',bank_id,'externalId',external_id,
      'questionId',question_id,'revision',revision,'unit',unit,'lesson',lesson,'prompt',prompt,
      'content',content,'answer',answer,'ideaKey',private.preset_question_idea(id)) order by n) filter (where n<=p_target_limit),'[]'::jsonb),
    coalesce(max(total),0)
    into targets, target_count from matched;
  if p_revision_id is not null then
    select jsonb_build_object('revisionId',v.id,'bankId',v.bank_id,'externalId',v.external_id,
      'questionId',v.question_id,'revision',v.revision,'unit',v.unit,'lesson',v.lesson,'prompt',v.prompt,
      'content',v.content,'answer',v.answer,'ideaKey',private.preset_question_idea(v.id))
      into selected_target
    from public.question_bank_memberships m join public.questions q on q.id=m.question_id
      join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.bank_id=p_bank_id and q.owner_id=actor and q.is_active and v.id=p_revision_id;
  end if;

  return jsonb_build_object('reviewer',reviewer,
    'recordCount',record_count,
    'records',(select coalesce(jsonb_agg(private.preset_curation_record_json(id,reviewer) order by n),'[]'::jsonb)
      from unnest(record_ids) with ordinality u(id,n)),
    'bankRecord',case when bank_record is null then null else private.preset_curation_record_json(bank_record,reviewer) end,
    'selectedRecord',case when selected_record is null then null else private.preset_curation_record_json(selected_record,reviewer) end,
    'targetCount',target_count,'targets',targets,'selectedTarget',selected_target);
end;
$$;

create function private.get_preset_provenance_readback(p_bank_id uuid, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reviewer text := private.preset_reviewer_name(); result jsonb;
begin
  if actor is null or not exists(select 1 from public.question_banks where id=p_bank_id and owner_id=actor) then
    raise exception 'Bank is inaccessible.' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 10000 or array_position(p_ids, null) is not null then
    raise exception 'Read back one to 10,000 records.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revisionId',r.question_revision_id,'provenance',r.provenance,
      'privateNotes',case when reviewer is not null then r.private_source_notes else null end) order by r.id),'[]'::jsonb)
    into result
  from public.preset_curation r left join public.question_revisions v on v.id=r.question_revision_id
  where r.id=any(p_ids) and (r.bank_id=p_bank_id or (r.owner_id=actor and exists(select 1 from public.question_bank_memberships m
    where m.bank_id=p_bank_id and m.question_id=v.question_id)));
  return result;
end;
$$;

create function public.get_preset_curation_view(p_bank_id uuid, p_search text default '', p_revision_id uuid default null,
  p_record_limit integer default 25, p_target_limit integer default 100)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_preset_curation_view(p_bank_id, p_search, p_revision_id, p_record_limit, p_target_limit);
$$;
create function public.get_preset_provenance_readback(p_bank_id uuid, p_ids uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_preset_provenance_readback(p_bank_id, p_ids);
$$;

revoke all on function private.preset_curation_record_json(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.get_preset_curation_view(uuid,text,uuid,integer,integer),private.get_preset_provenance_readback(uuid,uuid[]),
  public.get_preset_curation_view(uuid,text,uuid,integer,integer),public.get_preset_provenance_readback(uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.get_preset_curation_view(uuid,text,uuid,integer,integer),private.get_preset_provenance_readback(uuid,uuid[]),
  public.get_preset_curation_view(uuid,text,uuid,integer,integer),public.get_preset_provenance_readback(uuid,uuid[]) to authenticated;
