begin;
create table public.preset_ingestion_batches (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  import_id uuid not null,
  source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'),
  schema_version smallint not null check(schema_version=1),
  mapping_version smallint not null check(mapping_version=1),
  payload jsonb not null,
  created_count integer not null,
  skipped_count integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key(import_id,owner_id) references public.catalogue_imports(id,owner_id) on delete restrict
);
create index preset_ingestion_batches_owner_import_idx on public.preset_ingestion_batches(owner_id,import_id);
alter table public.preset_ingestion_batches enable row level security;
revoke all on public.preset_ingestion_batches from public,anon,authenticated;
create trigger preset_ingestion_batches_immutable before update or delete on public.preset_ingestion_batches
  for each row execute function private.preset_history_immutable();

create function private.stage_preset_provenance_batch(p_id uuid,p_import_id uuid,p_source_sha256 text,p_schema_version integer,
  p_mapping_version integer,p_entries jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); intake public.catalogue_imports%rowtype; receipt public.preset_ingestion_batches%rowtype;
  entry jsonb; v public.question_revisions%rowtype; existing public.preset_curation%rowtype;
  created integer:=0; skipped integer:=0;
begin
  if actor is null or private.preset_reviewer_name() is null or p_id is null then
    raise exception 'Authorized reviewer required for governed intake.' using errcode='42501'; end if;
  if p_schema_version is distinct from 1 or p_mapping_version is distinct from 1 or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 2000 or jsonb_typeof(p_entries) is distinct from 'array'
    or octet_length(p_entries::text)>700000 then raise exception 'Invalid bounded intake envelope.' using errcode='23514'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 or
    (select count(distinct x->>'revisionId') from jsonb_array_elements(p_entries) x)<>jsonb_array_length(p_entries) then
    raise exception 'Stage one to 100 distinct revisions.' using errcode='23514'; end if;
  select * into intake from public.catalogue_imports where id=p_import_id and owner_id=actor;
  if not found or intake.source_sha256 is distinct from p_source_sha256 or
    (select count(*) from public.catalogue_import_rows where import_id=intake.id)<>intake.expected_rows then
    raise exception 'Exact complete owned source release required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':preset-intake:'||p_id::text,0));
  select * into receipt from public.preset_ingestion_batches where id=p_id;
  if found then
    if receipt.owner_id<>actor or receipt.import_id<>p_import_id or receipt.source_sha256<>p_source_sha256
      or receipt.payload<>p_entries or receipt.reason<>p_reason then
      raise exception 'Governed intake retry differs from its receipt.' using errcode='23505'; end if;
    return jsonb_build_object('batchId',receipt.id,'importId',receipt.import_id,'sourceSha256',receipt.source_sha256,
      'schemaVersion',1,'mappingVersion',1,'created',0,'skipped',jsonb_array_length(p_entries),'updated',0,'rejected',0);
  end if;
  for entry in select x from jsonb_array_elements(p_entries) x order by x->>'revisionId' loop
    if jsonb_typeof(entry) is distinct from 'object' or
      (select array_agg(key order by key) from jsonb_object_keys(entry) key) is distinct from
      array['id','privateNotes','provenance','revisionId']::text[] or jsonb_typeof(entry->'privateNotes') is distinct from 'string'
      or char_length(entry->>'privateNotes')>10000 then raise exception 'Invalid governed row.' using errcode='23514'; end if;
    perform private.validate_preset_provenance(entry->'provenance');
    select v0.* into v from public.question_revisions v0 join public.questions q on q.id=v0.question_id
      where v0.id=(entry->>'revisionId')::uuid and q.owner_id=actor and q.bank_id=intake.source_bank_id
        and q.current_revision=v0.revision and q.is_active for share of q;
    if not found or not exists(select 1 from public.catalogue_import_rows ir
      where ir.import_id=intake.id and ir.catalogue_id=v.external_id and ir.normalized is not null)
      or not exists(select 1 from public.catalogue_promotion_batches b,
        lateral jsonb_array_elements(b.payload->'questions') q
        where b.import_id=intake.id and q->>'id'=v.question_id::text and q->>'external_id'=v.external_id) then
      raise exception 'Revision lacks its validated canonical source conversion.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended('preset:'||intake.source_bank_id::text||':'||v.id::text,0));
    select * into existing from public.preset_curation where question_revision_id=v.id for update;
    if found then
      if existing.id::text<>entry->>'id' or existing.provenance<>entry->'provenance' or existing.private_source_notes<>entry->>'privateNotes' then
        raise exception 'Existing provenance requires an explicit correction, not an import overwrite.' using errcode='23505'; end if;
      skipped:=skipped+1;
    else
      perform private.save_preset_provenance((entry->>'id')::uuid,intake.source_bank_id,v.id,0,entry->'provenance',entry->>'privateNotes',p_reason);
      created:=created+1;
    end if;
  end loop;
  insert into public.preset_ingestion_batches(id,owner_id,import_id,source_sha256,schema_version,mapping_version,payload,created_count,skipped_count,reason)
    values(p_id,actor,p_import_id,p_source_sha256,1,1,p_entries,created,skipped,p_reason);
  return jsonb_build_object('batchId',p_id,'importId',p_import_id,'sourceSha256',p_source_sha256,
    'schemaVersion',1,'mappingVersion',1,'created',created,'skipped',skipped,'updated',0,'rejected',0);
end;
$$;
create function public.stage_preset_provenance_batch(p_id uuid,p_import_id uuid,p_source_sha256 text,p_schema_version integer,
  p_mapping_version integer,p_entries jsonb,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.stage_preset_provenance_batch(p_id,p_import_id,p_source_sha256,p_schema_version,p_mapping_version,p_entries,p_reason);
$$;
revoke all on function private.stage_preset_provenance_batch(uuid,uuid,text,integer,integer,jsonb,text),
  public.stage_preset_provenance_batch(uuid,uuid,text,integer,integer,jsonb,text) from public,anon,authenticated;
grant execute on function private.stage_preset_provenance_batch(uuid,uuid,text,integer,integer,jsonb,text),
  public.stage_preset_provenance_batch(uuid,uuid,text,integer,integer,jsonb,text) to authenticated;
commit;
