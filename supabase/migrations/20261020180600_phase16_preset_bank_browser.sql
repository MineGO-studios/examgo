begin;
-- A separate projection keeps earlier Preview clients compatible.
create function public.get_preset_bank_browser(p_bank_id uuid, p_after uuid default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_bank_id is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid browser request.' using errcode='23514'; end if;
  with eligible as materialized (
    select v.* from private.shared_preset_revisions() e
    join public.question_revisions v on v.id=e.revision_id where v.bank_id=p_bank_id
  ), page as materialized (
    select * from eligible where p_after is null or question_id>p_after order by question_id limit p_limit
  ), visible_groups as materialized (
    select g.* from public.question_groups g
    where exists(select 1 from public.question_group_questions m join page q on q.question_id=m.question_id where m.group_id=g.id)
      and not exists(select 1 from public.question_group_questions m
        where m.group_id=g.id and not exists(select 1 from eligible e where e.question_id=m.question_id))
  )
  select jsonb_build_object('version',md5(coalesce((select string_agg(id::text,',' order by question_id) from eligible),'')),
    'questions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.question_id,'revisionId',q.id,'prompt',q.prompt,'unit',q.unit,'lesson',q.lesson,
      'type',q.question_type,'difficulty',q.difficulty,'externalId',q.external_id,
      'linked',exists(select 1 from public.question_group_questions m where m.question_id=q.question_id),
      'content',jsonb_build_object('labelMode',q.content->'labelMode','options',
        case when jsonb_typeof(q.content->'options')='array' then
          (select jsonb_agg(jsonb_build_object('label',o->'label','text',o->'text') order by n)
           from jsonb_array_elements(q.content->'options') with ordinality x(o,n)) else null end),
      'answer',(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(q.answer)
        where key in ('correctOptionLabel','isTrue','canonicalAnswer','oddWord','answers','pairs'))
      ) order by q.question_id) from page q),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'revision',g.revision,'type',g.group_type,'title',g.title,'instructions',g.instructions,
      'passage',case when g.group_type='passage' then g.content->>'text' else null end,
      'arabicInstruction',g.content->>'arabicInstruction','attemptCount',g.attempt_count,
      'questionIds',(select jsonb_agg(m.question_id order by m.position) from public.question_group_questions m where m.group_id=g.id)
      ) order by g.id) from visible_groups g),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.get_preset_bank_browser(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_preset_bank_browser(uuid,uuid,integer) to authenticated;
commit;
