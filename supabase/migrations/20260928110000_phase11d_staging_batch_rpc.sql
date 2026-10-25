-- The authenticated teacher can retry a whole group batch without replacing evidence.
create function public.stage_catalogue_import_batch(p_import_id uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  teacher uuid := auth.uid();
  entry jsonb;
  existing_hash text;
  inserted_count integer := 0;
  skipped_count integer := 0;
  tags smallint[];
  groups text[];
begin
  if teacher is null then
    raise exception 'Sign in before importing.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalogue_imports i where i.id = p_import_id and i.owner_id = teacher) then
    raise exception 'Import is missing or inaccessible.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 100
    or octet_length(p_rows::text) > 1500000 then
    raise exception 'Import batch must contain one to 100 rows within 1.5 MB.' using errcode = '23514';
  end if;

  for entry in select value from jsonb_array_elements(p_rows) as value loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'sourceFields') is distinct from 'object'
      or jsonb_typeof(entry->'unitTags') is distinct from 'array'
      or jsonb_typeof(entry->'groupIds') is distinct from 'array' then
      raise exception 'Import row shape is invalid.' using errcode = '23514';
    end if;
    select array_agg(value::smallint order by ordinality) into tags
      from jsonb_array_elements_text(entry->'unitTags') with ordinality as item(value, ordinality);
    select coalesce(array_agg(value order by ordinality), '{}'::text[]) into groups
      from jsonb_array_elements_text(entry->'groupIds') with ordinality as item(value, ordinality);

    insert into public.catalogue_import_rows
      (import_id,owner_id,catalogue_id,source_content_hash,source_fields,unit_tags,display_unit,group_ids)
    values (p_import_id,teacher,entry->>'catalogueId',entry->>'sourceContentHash',
      entry->'sourceFields',tags,(entry->>'displayUnit')::smallint,groups)
    on conflict (import_id,catalogue_id) do nothing;
    if found then
      inserted_count := inserted_count + 1;
    else
      select r.source_content_hash into existing_hash from public.catalogue_import_rows r
        where r.import_id = p_import_id and r.catalogue_id = entry->>'catalogueId';
      if existing_hash is distinct from entry->>'sourceContentHash' then
        raise exception 'Catalogue ID conflicts with different source content.' using errcode = '23505';
      end if;
      skipped_count := skipped_count + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted',inserted_count,'unchanged',skipped_count);
end;
$$;

revoke all on function public.stage_catalogue_import_batch(uuid,jsonb) from public, anon;
grant execute on function public.stage_catalogue_import_batch(uuid,jsonb) to authenticated;
