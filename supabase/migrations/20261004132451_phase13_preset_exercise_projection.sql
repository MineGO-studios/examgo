begin;

-- Read-only preparation. No old capture, publication, selection or aggregate function changes.
create function private.reviewed_preset_member(p_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.question_revisions%rowtype; c public.preset_curation%rowtype; p public.preset_publications%rowtype;
  content_fields text[]; answer_fields text[]; content jsonb; answer jsonb; field_name text; items jsonb;
  keys text[]; point_mapping jsonb; complex boolean;
begin
  select * into v from public.question_revisions where id=p_revision_id;
  if not found or v.unit not between 1 and 4 or v.schema_version<>1 or
    not private.preset_question_is_eligible(v.id) then return null; end if;
  content_fields:=array['type','schemaVersion']; answer_fields:=array['type','schemaVersion'];
  case v.question_type
    when 'multiple-choice' then
      content_fields:=content_fields||array['options']; answer_fields:=answer_fields||array['correctOptionLabel'];
    when 'binary' then
      content_fields:=content_fields||array['labelMode']; answer_fields:=answer_fields||array['isTrue'];
    when 'short-answer' then
      content_fields:=content_fields||array['answerLines'];
      answer_fields:=answer_fields||array['canonicalAnswer','approvedVariants','caseSensitive'];
    when 'completion' then
      if jsonb_typeof(v.content->'blankIds') is distinct from 'array' then return null; end if;
      if jsonb_array_length(v.content->'blankIds') not between 1 and 200 then return null; end if;
      content_fields:=content_fields||array['text','blankIds','wordBank','wordBankOrder','allowWordReuse','requireAllWordsUsed'];
      answer_fields:=answer_fields||array['answers'];
    when 'matching' then
      content_fields:=content_fields||array['left','right']; answer_fields:=answer_fields||array['pairs'];
    when 'odd-word' then
      content_fields:=content_fields||array['words']; answer_fields:=answer_fields||array['oddWord'];
    when 'word-relationship' then
      content_fields:=content_fields||array['words']; answer_fields:=answer_fields||array['acceptedAnswers'];
    when 'rewrite' then
      content_fields:=content_fields||array['instruction']; answer_fields:=answer_fields||array['acceptedAnswers'];
    when 'extended-writing' then
      content_fields:=content_fields||array['minimumWords','maximumWords'];
      answer_fields:=answer_fields||array['rubricCriteria','modelAnswer','manualMarkingNote'];
    else return null;
  end case;
  select jsonb_object_agg(k,x) into content from jsonb_each(v.content) fields(k,x) where k=any(content_fields);
  select jsonb_object_agg(k,x) into answer from jsonb_each(v.answer) fields(k,x) where k=any(answer_fields);
  if v.question_type='multiple-choice' then
    if jsonb_typeof(content->'options') is distinct from 'array' then return null; end if;
    if jsonb_array_length(content->'options') not between 2 and 6 then return null; end if;
    select jsonb_agg(jsonb_build_object('label',x->'label','text',x->'text') order by ord) into items
      from jsonb_array_elements(content->'options') with ordinality elements(x,ord);
    content:=jsonb_set(content,'{options}',items);
  elsif v.question_type='matching' then
    foreach field_name in array array['left','right'] loop
      if jsonb_typeof(content->field_name) is distinct from 'array' then return null; end if;
      if jsonb_array_length(content->field_name) not between 2 and 20 then return null; end if;
      select jsonb_agg(jsonb_build_object('id',x->'id','text',x->'text') order by ord) into items
        from jsonb_array_elements(content->field_name) with ordinality elements(x,ord);
      content:=jsonb_set(content,array[field_name],items);
    end loop;
    if jsonb_typeof(answer->'pairs') is distinct from 'array' then return null; end if;
    if jsonb_array_length(answer->'pairs')<>jsonb_array_length(content->'left') then return null; end if;
    select jsonb_agg(jsonb_build_object('leftId',x->'leftId','rightId',x->'rightId') order by ord) into items
      from jsonb_array_elements(answer->'pairs') with ordinality elements(x,ord);
    answer:=jsonb_set(answer,'{pairs}',items);
  end if;
  complex:=v.question_type='matching' or (v.question_type='completion' and jsonb_array_length(v.content->'blankIds')>1);
  if complex then
    keys:=private.preset_point_selection_keys(v.id);
    select mapping into point_mapping from private.preset_question_point_ideas where revision_id=v.id;
  else keys:=private.preset_selection_keys(v.id); point_mapping:=null;
  end if;
  if keys is null or cardinality(keys) not between 2 and 20 or
    octet_length(content::text)+octet_length(answer::text)>100000 then return null; end if;
  select * into c from public.preset_curation where question_revision_id=v.id;
  select * into p from public.preset_publications where curation_id=c.id;
  return jsonb_build_object('revisionId',v.id,'curationId',c.id,'revision',v.revision,'reviewVersion',p.review_version,
    'reviewer',c.reviewer_name,'approvedAt',c.approved_at,'publisher',p.publisher_name,'publishedAt',p.published_at,
    'provenance',private.current_preset_provenance(p.public_provenance),'selectionKeys',to_jsonb(keys),
    'pointIdeas',point_mapping,'question',jsonb_build_object('id',v.question_id,'schemaVersion',1,'type',v.question_type,
      'unit',v.unit,'lesson',v.lesson,'difficulty',v.difficulty,'prompt',v.prompt,'content',content,'answer',answer));
end;
$$;
revoke all on function private.reviewed_preset_member(uuid) from public,anon,authenticated;

create function private.reviewed_preset_exercise(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.question_groups%rowtype; row record; member jsonb; members jsonb:='[]';
  n integer:=0; points integer:=0; size integer; kind text; passage text; result jsonb;
  identities text[]:=array[]::text[]; scoped text[]; content jsonb; first_content jsonb;
begin
  select * into g from public.question_groups where id=p_group_id;
  if not found or g.parent_group_id is not null or g.schema_version<>1 or g.instructions is null
    or g.content#>>'{source,group_completeness}' is distinct from 'complete'
    or g.attempt_count is null or exists(select 1 from public.question_groups where parent_group_id=g.id)
    then return null; end if;
  for row in select m.position,m.owner_id,q.id,q.owner_id as question_owner,v.id as revision_id
    from public.question_group_questions m join public.questions q on q.id=m.question_id
    join public.question_revisions v on v.question_id=q.id and v.revision=q.current_revision
    where m.group_id=g.id order by m.position loop
    n:=n+1;
    if n>100 or row.position<>n or row.owner_id<>g.owner_id or row.question_owner<>g.owner_id
      or (select count(*) from public.question_group_questions where question_id=row.id)<>1 then return null; end if;
    member:=private.reviewed_preset_member(row.revision_id);
    if member is null then return null; end if;
    content:=member#>'{question,content}';
    size:=case member#>>'{question,type}' when 'matching' then jsonb_array_length(content->'left')
      when 'completion' then jsonb_array_length(content->'blankIds') else 1 end;
    points:=points+size;
    select array_agg((member#>>'{question,unit}')||':'||value) into scoped
      from jsonb_array_elements_text(member->'selectionKeys');
    if scoped && identities then return null; end if;
    identities:=identities||scoped;
    members:=members||jsonb_build_array(member);
  end loop;
  if n=0 or points not between 1 and 200 or g.attempt_count>points
    or g.content#>'{source,display_count}' is distinct from to_jsonb(points) then return null; end if;
  if g.group_type='passage' then
    kind:='passage'; passage:=g.content#>>'{source,passage_text}';
    if passage is null or char_length(btrim(passage)) not between 1 and 5000 then return null; end if;
  elsif n=1 and members#>>'{0,question,type}'='matching' then kind:='matching';
  elsif not exists(select 1 from jsonb_array_elements(members) m where m#>>'{question,type}'<>'completion') then
    kind:='completion'; first_content:=members#>'{0,question,content}';
    if n>1 and exists(select 1 from jsonb_array_elements(members) m
      where jsonb_array_length(m#>'{question,content,blankIds}')<>1
        or (m#>'{question,content}')-array['text','blankIds'] is distinct from first_content-array['text','blankIds'])
      then return null; end if;
  elsif g.group_type='alternative-choice' then
    if n<>2 or g.attempt_count<>1 then return null; end if; kind:='alternatives';
  else kind:='questions'; end if;
  if kind not in ('matching','completion') and exists(select 1 from jsonb_array_elements(members) m
    where m#>>'{question,type}' in ('matching','completion')) then return null; end if;
  result:=jsonb_build_object('schemaVersion',1,'id',g.id,'revision',g.revision,'kind',kind,
    'instruction',g.instructions,'title',g.title,'arabicInstruction',g.content->'arabicInstruction',
    'passage',passage,'displayedPointCount',points,'attemptCount',g.attempt_count,'members',members);
  if octet_length(result::text)>500000 then return null; end if;
  return result;
end;
$$;
revoke all on function private.reviewed_preset_exercise(uuid) from public,anon,authenticated;

create function private.get_reviewed_preset_exercises(p_after uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare exercises jsonb; cursor_id uuid; has_more boolean;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid page bound.' using errcode='23514'; end if;
  with page as materialized (
    select g.id,projection.exercise from public.question_groups g
    cross join lateral (select private.reviewed_preset_exercise(g.id) exercise offset 0) projection
    where g.parent_group_id is null and (p_after is null or g.id>p_after) and projection.exercise is not null
    order by g.id limit p_limit+1
  ), visible as (select * from page order by id limit p_limit)
  select coalesce((select jsonb_agg(exercise order by id) from visible),'[]'::jsonb),
    (select id from visible order by id desc limit 1),(select count(*)>p_limit from page)
    into exercises,cursor_id,has_more;
  return jsonb_build_object('schemaVersion',1,'exercises',exercises,
    'nextCursor',case when has_more then cursor_id else null end);
end;
$$;
revoke all on function private.get_reviewed_preset_exercises(uuid,integer) from public,anon,authenticated;
grant execute on function private.get_reviewed_preset_exercises(uuid,integer) to authenticated;

create function public.get_reviewed_preset_exercises(p_after uuid default null,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_reviewed_preset_exercises(p_after,p_limit);
$$;
revoke all on function public.get_reviewed_preset_exercises(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_reviewed_preset_exercises(uuid,integer) to authenticated;

commit;
