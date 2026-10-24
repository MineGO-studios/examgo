begin;

-- Aggregate only: no publisher IDs, prompts, answers, private notes or source rows.
-- Definer access is required because approved publications remain RLS-restricted.
create function private.get_grade_six_preset_coverage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated teacher required.' using errcode='42501';
  end if;
  with published as materialized (
    select v.id,v.question_id,v.unit,v.lesson,v.question_type,v.difficulty,
      private.preset_question_idea(v.id) is not null as known_idea
    from public.question_revisions v join public.questions q on q.id=v.question_id and q.current_revision=v.revision
    where v.unit between 1 and 4 and private.preset_revision_is_eligible(v.id)
  ), captured_groups as materialized (
    select value from (
      select private.preset_simple_group(g.id,1) value from public.question_groups g
      where g.group_type='branch' and g.parent_group_id is null
        and exists(select 1 from public.question_group_questions m join published v on v.question_id=m.question_id
          where m.group_id=g.id)
    ) candidates where value is not null
  ), standalone as materialized (
    select v.question_id from published v where v.unit=1 and v.known_idea
      and v.question_type in ('multiple-choice','binary','short-answer')
      and private.preset_question_is_eligible(v.id)
      and not exists(select 1 from public.question_group_questions m where m.question_id=v.question_id)
  ), breakdown as (
    select unit,lesson,question_type,difficulty,count(*) as n,count(*) filter(where known_idea) as known
    from published group by unit,lesson,question_type,difficulty
  )
  select jsonb_build_object('schemaVersion',1,'captureScope','unit-one-simple','difficultyCalibrated',false,
    'units',jsonb_agg(jsonb_build_object(
      'unit',u.unit,
      'publishedQuestionCount',(select count(*) from published v where v.unit=u.unit),
      'knownIdeaQuestionCount',(select count(*) from published v where v.unit=u.unit and v.known_idea),
      'capturableGroupCount',case when u.unit=1 then (select count(*) from captured_groups) else 0 end,
      'capturableGroupPointCount',case when u.unit=1 then (select coalesce(sum(jsonb_array_length(value->'members')),0) from captured_groups) else 0 end,
      'capturableStandaloneCount',case when u.unit=1 then (select count(*) from standalone) else 0 end,
      'breakdown',coalesce((select jsonb_agg(jsonb_build_object(
        'lesson',b.lesson,'type',b.question_type,'difficulty',b.difficulty,
        'publishedCount',b.n,'knownIdeaCount',b.known) order by b.lesson,b.question_type,b.difficulty)
        from breakdown b where b.unit=u.unit),'[]'::jsonb)) order by u.unit)) into result
  from generate_series(1,4) u(unit);
  return result;
end;
$$;

create function public.get_grade_six_preset_coverage()
returns jsonb language sql security invoker set search_path='' as $$
  select private.get_grade_six_preset_coverage();
$$;
revoke all on function private.get_grade_six_preset_coverage(),public.get_grade_six_preset_coverage()
  from public,anon,authenticated;
grant execute on function private.get_grade_six_preset_coverage(),public.get_grade_six_preset_coverage()
  to authenticated;

commit;
