-- Fill only previously absent confirmed mappings. Original source rows and
-- established mappings remain immutable to ordinary teachers.
create function private.attach_catalogue_mapping(p_import_id uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
  teacher uuid:=auth.uid();
  entry jsonb;
  saved public.catalogue_import_rows%rowtype;
  attached integer:=0;
begin
  if teacher is null or not exists(select 1 from public.catalogue_imports i
    join public.question_banks b on b.id=i.source_bank_id and b.owner_id=i.owner_id
    where i.id=p_import_id and i.owner_id=teacher and not b.is_archived) then
    raise exception 'Import is missing, archived or inaccessible.' using errcode='42501';
  end if;
  -- Same import lock as canonical commits serializes mapping and commit retries.
  perform i.id from public.catalogue_imports i where i.id=p_import_id and i.owner_id=teacher for update;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100
    or octet_length(p_rows::text)>1500000 then
    raise exception 'Mapping batch must contain one to 100 rows within 1.5 MB.' using errcode='23514';
  end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    select r.* into saved from public.catalogue_import_rows r
      where r.import_id=p_import_id and r.catalogue_id=entry->>'catalogueId' and r.owner_id=teacher;
    if not found then raise exception 'Mapping row is outside this owned intake.' using errcode='42501'; end if;
    if entry->>'sourceContentHash' is distinct from saved.source_content_hash
      or jsonb_typeof(entry->'normalized') is distinct from 'object'
      or entry->'normalized'->>'catalogueId' is distinct from saved.catalogue_id
      or entry->'normalized'->'sourceFields' is distinct from saved.source_fields
      or entry->'normalized'->'unitTags' is distinct from to_jsonb(saved.unit_tags)
      or entry->'normalized'->'displayUnit' is distinct from to_jsonb(saved.display_unit)
      or entry->'normalized'->'groupIds' is distinct from to_jsonb(saved.group_ids)
      or entry->'normalized'->'selectionMarks' is distinct from 'null'::jsonb then
      raise exception 'Mapping changed original source, identity, units, groups or mark ownership.' using errcode='23514';
    end if;
    if saved.normalized is null then
      update public.catalogue_import_rows set normalized=entry->'normalized'
        where import_id=p_import_id and catalogue_id=saved.catalogue_id and owner_id=teacher and normalized is null;
      attached:=attached+1;
    elsif saved.normalized is distinct from entry->'normalized' then
      raise exception 'A different confirmed mapping is already saved.' using errcode='23505';
    end if;
  end loop;
  return attached;
end;
$$;
create function public.attach_catalogue_mapping(p_import_id uuid,p_rows jsonb)
returns integer language sql security invoker set search_path='' as $$
  select private.attach_catalogue_mapping(p_import_id,p_rows);
$$;
revoke all on function private.attach_catalogue_mapping(uuid,jsonb),public.attach_catalogue_mapping(uuid,jsonb) from public,anon;
grant execute on function private.attach_catalogue_mapping(uuid,jsonb),public.attach_catalogue_mapping(uuid,jsonb) to authenticated;
