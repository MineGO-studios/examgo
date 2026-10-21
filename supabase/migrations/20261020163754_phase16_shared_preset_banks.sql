begin;

-- Published projections are shared by role, including accounts created later.
-- Source tables and publisher-private curation stay under their existing RLS.
-- Evaluate revision eligibility once; an incomplete group suppresses every member.
create function private.shared_preset_revisions()
returns table(question_id uuid, revision_id uuid, bank_id uuid)
language sql stable security definer set search_path='' as $$
  with published as materialized (
    select v.question_id,v.id as revision_id,v.bank_id
    from public.question_revisions v
    join public.questions q on q.id=v.question_id and q.current_revision=v.revision
    join public.preset_curation c on c.question_revision_id=v.id
    join public.preset_publications p on p.curation_id=c.id
    where private.preset_revision_is_eligible(v.id)
  ), incomplete_groups as materialized (
    select distinct m.group_id from public.question_group_questions m
    left join published e on e.question_id=m.question_id
    where e.revision_id is null
  )
  select e.question_id,e.revision_id,e.bank_id from published e
  where not exists(select 1 from public.question_group_questions m
    join incomplete_groups g on g.group_id=m.group_id where m.question_id=e.question_id);
$$;
revoke all on function private.shared_preset_revisions() from public,anon,authenticated;

create function public.get_preset_banks(p_after uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page bound.' using errcode='23514'; end if;
  return (select coalesce(jsonb_agg(value order by id),'[]'::jsonb) from (
    select b.id,jsonb_build_object('id',b.id,'name',b.name,'grade',b.grade,'subject',b.subject,
      'publishedCount',count(*)) value
    from public.question_banks b
    join private.shared_preset_revisions() v on v.bank_id=b.id
    where not b.is_archived and (p_after is null or b.id>p_after)
    group by b.id order by b.id limit p_limit
  ) banks);
end;
$$;

-- Catalogue fields only: no owner identifiers, private notes or unpublished data.
create function public.get_preset_bank_questions(p_bank_id uuid, p_after uuid default null,
  p_limit integer default 50, p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_bank_id is null or p_limit is null or p_limit not between 1 and 100
    or p_search is null or char_length(p_search)>200 then raise exception 'Invalid catalogue request.' using errcode='23514'; end if;
  return (select coalesce(jsonb_agg(value order by question_id),'[]'::jsonb) from (
    select v.question_id,jsonb_build_object('id',v.question_id,'revisionId',v.id,
      'prompt',v.prompt,'unit',v.unit,'lesson',v.lesson,'type',v.question_type,'difficulty',v.difficulty) value
    from private.shared_preset_revisions() e
    join public.question_revisions v on v.id=e.revision_id
    where v.bank_id=p_bank_id and (p_after is null or v.question_id>p_after)
      and (btrim(p_search)='' or strpos(lower(v.prompt),lower(btrim(p_search)))>0
        or strpos(lower(v.lesson),lower(btrim(p_search)))>0)
    order by v.question_id limit p_limit
  ) questions);
end;
$$;
revoke all on function public.get_preset_banks(uuid,integer),
  public.get_preset_bank_questions(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.get_preset_banks(uuid,integer),
  public.get_preset_bank_questions(uuid,uuid,integer,text) to authenticated;
commit;
