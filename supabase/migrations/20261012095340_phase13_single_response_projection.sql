-- Owner-authorized Development migration. Stored source counts remain unchanged.
-- Extends only complete single-response writing/punctuation projection, not Phase 14 teacher settings.
begin;

do $guard$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef('private.reviewed_preset_exercise(uuid)'::regprocedure)) is distinct from 'ce67c2b40cf1ed0bc35d6858d7248505' then
    raise exception 'Single-response projection preflight changed.' using errcode='40001';
  end if;
end;
$guard$;


create or replace function private.reviewed_preset_exercise(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.question_groups%rowtype; row record; member jsonb; members jsonb:='[]';
  n integer:=0; points integer:=0; size integer; kind text; passage text; result jsonb;
  required_count integer;
  identities text[]:=array[]::text[]; scoped text[]; content jsonb; first_content jsonb;
begin
  select * into g from public.question_groups where id=p_group_id;
  if not found or g.parent_group_id is not null or g.schema_version<>1 or g.instructions is null
    or g.content#>>'{source,group_completeness}' is distinct from 'complete'
    or (g.attempt_count is null and (g.group_type not in ('main-question','branch')
      or g.content#>'{source,display_count}' is distinct from to_jsonb(1)))
    or exists(select 1 from public.question_groups where parent_group_id=g.id)
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
  required_count:=g.attempt_count;
  -- A complete single-topic writing or punctuation source has exactly one response.
  -- This does not invent a source count or configure a teacher's future blueprint.
  if required_count is null then
    if n<>1 or points<>1 or g.group_type not in ('main-question','branch') then return null; end if;
    if members#>>'{0,question,type}'='extended-writing'
      and g.instructions !~* '\m(choose|either)\M'
      and members#>>'{0,question,prompt}' !~* '\m(choose|either)\M'
      then required_count:=1;
    elsif members#>>'{0,question,type}'='rewrite'
      and g.instructions ~* '(^|:)[[:space:]]*re[- ]?write([[:space:]]|$)'
      and g.instructions ~* '(using|with)[[:space:][:alpha:]]*punctuation'
      and g.instructions !~* '(do not|don''t|without|no)[[:space:]]+(rewrite|punctuation|capital)'
      then required_count:=1;
    else return null; end if;
  end if;
  if n=0 or points not between 1 and 200 or required_count not between 1 and points
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
  elsif g.group_type in ('main-question','branch') and n=2 and required_count=1
    and g.instructions ~* '(^|:)[[:space:]]*choose[[:space:]]+(either[[:space:]]+)?A[[:space:]]+or[[:space:]]+B([[:space:][:punct:]]|$)'
    and not exists(select 1 from jsonb_array_elements(members) m where m#>>'{question,type}'<>'extended-writing')
    then kind:='alternatives';
  elsif g.group_type='alternative-choice' then
    if n<>2 or required_count<>1 then return null; end if; kind:='alternatives';
  else kind:='questions'; end if;
  if kind not in ('matching','completion') and exists(select 1 from jsonb_array_elements(members) m
    where m#>>'{question,type}' in ('matching','completion')) then return null; end if;
  result:=jsonb_build_object('schemaVersion',1,'id',g.id,'revision',g.revision,'kind',kind,
    'instruction',g.instructions,'title',g.title,'arabicInstruction',g.content->'arabicInstruction',
    'passage',passage,'displayedPointCount',points,'attemptCount',required_count,'members',members);
  if octet_length(result::text)>500000 then return null; end if;
  return result;
end;
$$;

commit;
