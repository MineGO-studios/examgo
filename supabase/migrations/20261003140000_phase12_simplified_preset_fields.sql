begin;
-- Owner policy update, 3 October 2026. Preset fields only; user banks and immutable
-- source releases, publications, audit history and saved snapshots are untouched.
-- Version 1 remains readable for historical receipts and compatible retries.
create or replace function private.validate_preset_provenance_v1(p jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare k text; cap integer;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 30000 then
    raise exception 'Invalid provenance object.' using errcode='23514'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p) key) is distinct from
    array['answerEvidence','author','corpusScope','curriculumVersion','ministerialOccurrences','missingEvidence',
      'rightsEvidence','rightsStatus','schemaVersion','sourceEvidence','sourceKind','sourceReference']::text[]
    or p->'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'Unsupported provenance schema or fields.' using errcode='23514'; end if;
  for k,cap in select * from (values ('curriculumVersion',200),('author',200),('sourceReference',500),
    ('answerEvidence',2000),('rightsEvidence',2000),('corpusScope',2000)) limits loop
    if jsonb_typeof(p->k) is distinct from 'string' or char_length(p->>k) > cap then
      raise exception 'Invalid provenance text: %.',k using errcode='23514'; end if;
  end loop;
  if coalesce(p->>'sourceKind' not in ('ministerial-paper','teacher-authored','unknown'),true) or
    coalesce(p->>'sourceEvidence' not in ('verified','unverified','missing'),true) or
    coalesce(p->>'rightsStatus' not in ('unknown','permitted','restricted'),true) then
    raise exception 'Invalid source or rights status.' using errcode='23514'; end if;
  if p->'ministerialOccurrences' is distinct from 'null'::jsonb then
    if jsonb_typeof(p->'ministerialOccurrences') is distinct from 'number' or
      p->>'ministerialOccurrences' !~ '^[0-9]+$' or (p->>'ministerialOccurrences')::numeric > 100000 or
      btrim(p->>'corpusScope') = '' then raise exception 'Counts require an assessed corpus.' using errcode='23514'; end if;
  end if;
  if jsonb_typeof(p->'missingEvidence') is distinct from 'array' then
    raise exception 'Missing evidence must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p->'missingEvidence') > 20 or exists (select 1 from jsonb_array_elements(p->'missingEvidence') x
    where jsonb_typeof(x) <> 'string' or char_length(x#>>'{}') > 500 or btrim(x#>>'{}') = '') then
    raise exception 'Invalid missing evidence list.' using errcode='23514'; end if;
end;
$$;
create or replace function private.validate_preset_provenance(p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p->'schemaVersion'='1'::jsonb then perform private.validate_preset_provenance_v1(p); return; end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>30000 or
    p->'schemaVersion' is distinct from '2'::jsonb or
    (select array_agg(key order by key) from jsonb_object_keys(p) key) is distinct from
      array['corpusScope','ministerialOccurrences','missingEvidence','schemaVersion','sourceReference']::text[] or
    jsonb_typeof(p->'sourceReference') is distinct from 'string' or char_length(p->>'sourceReference')>500 or
    jsonb_typeof(p->'corpusScope') is distinct from 'string' or char_length(p->>'corpusScope')>2000 then
    raise exception 'Unsupported preset schema or fields.' using errcode='23514'; end if;
  if p->'ministerialOccurrences' is distinct from 'null'::jsonb then
    if jsonb_typeof(p->'ministerialOccurrences') is distinct from 'number' or
      p->>'ministerialOccurrences' !~ '^[0-9]+$' or (p->>'ministerialOccurrences')::numeric>100000 or
      btrim(p->>'corpusScope')='' then raise exception 'Counts require an assessed corpus.' using errcode='23514'; end if;
  end if;
  if jsonb_typeof(p->'missingEvidence') is distinct from 'array' then
    raise exception 'Missing evidence must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p->'missingEvidence')>20 or exists(select 1 from jsonb_array_elements(p->'missingEvidence') x
    where jsonb_typeof(x)<>'string' or char_length(x#>>'{}')>500 or btrim(x#>>'{}')='') then
    raise exception 'Invalid missing evidence list.' using errcode='23514'; end if;
end;
$$;
create function private.current_preset_provenance(p jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('schemaVersion',2,'sourceReference',p->'sourceReference','corpusScope',p->'corpusScope',
    'ministerialOccurrences',p->'ministerialOccurrences','missingEvidence',coalesce((select jsonb_agg(x order by n)
      from jsonb_array_elements(p->'missingEvidence') with ordinality items(x,n)
      where p->'schemaVersion'<>'1'::jsonb or x#>>'{}' not in
        ('Verify curriculum edition and named source author.','Verify source classification, answer evidence and reuse permission.')),'[]'::jsonb));
$$;
create or replace function private.transition_preset_curation(p_id uuid,p_expected_version integer,p_state text,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_name text := private.preset_reviewer_name(); r public.preset_curation%rowtype;
begin
  if actor is null or actor_name is null then raise exception 'Preset reviewer authority required.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A bounded decision reason is required.' using errcode='23514'; end if;
  select * into r from public.preset_curation where id=p_id for update;
  if not found then raise exception 'Curation record is inaccessible.' using errcode='42501'; end if;
  if r.version is distinct from p_expected_version then raise exception 'Stale curation version.' using errcode='40001'; end if;
  if not ((r.state='draft' and p_state in ('in-review','withdrawn')) or
    (r.state='in-review' and p_state in ('draft','approved','withdrawn')) or
    (r.state='approved' and p_state in ('superseded','withdrawn'))) then
    raise exception 'Invalid curation transition.' using errcode='23514'; end if;
  if p_state='approved' then
    perform private.validate_preset_provenance(r.provenance);
    if btrim(r.provenance->>'sourceReference')='' or
      jsonb_array_length(private.current_preset_provenance(r.provenance)->'missingEvidence')<>0 then
      raise exception 'Approval requires a source reference and resolved content problems.' using errcode='23514'; end if;
    perform 1 from public.question_banks where id=r.bank_id and not is_archived for share;
    if not found then raise exception 'Archived bank cannot be approved.' using errcode='23514'; end if;
    if r.question_revision_id is not null then
      perform 1 from public.question_revisions v join public.questions q on q.id=v.question_id
        where v.id=r.question_revision_id and v.revision=q.current_revision and q.is_active for share of q;
      if not found then raise exception 'Current active source revision required.' using errcode='23514'; end if;
    end if;
  end if;
  update public.preset_curation set state=p_state,version=version+1,updated_at=now(),
    reviewer_id=case when p_state='approved' then actor else reviewer_id end,
    reviewer_name=case when p_state='approved' then actor_name else reviewer_name end,
    approved_at=case when p_state='approved' then now() else approved_at end where id=p_id returning * into r;
  insert into public.preset_curation_history(curation_id,version,actor_id,actor_name,state,provenance,private_source_notes,reason)
    values(r.id,r.version,actor,actor_name,r.state,r.provenance,r.private_source_notes,p_reason);
  return r.version;
end;
$$;
create or replace function private.publish_preset_revision(p_id uuid,p_expected_version integer,p_public_provenance jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); name text:=private.preset_reviewer_name(); r public.preset_curation%rowtype;
  qid uuid; groups jsonb; saved public.preset_publications%rowtype; k text;
begin
  if actor is null or name is null then raise exception 'Preset publisher authority required.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'A publication reason is required.' using errcode='23514'; end if;
  perform private.validate_preset_provenance(p_public_provenance);
  select * into r from public.preset_curation where id=p_id for update;
  if not found then raise exception 'Review is inaccessible.' using errcode='42501'; end if;
  if r.version is distinct from p_expected_version then raise exception 'Review changed.' using errcode='40001'; end if;
  if r.state<>'approved' or r.question_revision_id is null or r.approved_at is null or r.reviewer_id is null then
    raise exception 'Publish only an explicitly approved exact question revision.' using errcode='23514'; end if;
  foreach k in array array['schemaVersion','ministerialOccurrences','missingEvidence'] loop
    if private.current_preset_provenance(p_public_provenance)->k is distinct from private.current_preset_provenance(r.provenance)->k then
      raise exception 'Public facts differ from the approval.' using errcode='23514'; end if;
  end loop;
  if btrim(p_public_provenance->>'sourceReference')='' or
    (p_public_provenance->'ministerialOccurrences'<>'null'::jsonb and btrim(p_public_provenance->>'corpusScope')='') then
    raise exception 'Public source reference and assessed corpus are required.' using errcode='23514'; end if;
  perform 1 from public.question_banks b where b.id=r.bank_id and not b.is_archived for share;
  if not found then raise exception 'Archived source bank.' using errcode='40001'; end if;
  select q.id into qid from public.questions q join public.question_revisions v on v.question_id=q.id
    where v.id=r.question_revision_id and q.owner_id=r.owner_id and v.revision=q.current_revision and q.is_active
    for share of q;
  if not found then raise exception 'Current active source revision required.' using errcode='40001'; end if;
  -- Stabilize group identity/order against concurrent source corrections.
  perform g.id from public.question_groups g join public.question_group_questions m on m.group_id=g.id
    where m.question_id=qid order by g.id for share of g;
  groups:=private.preset_source_groups(qid);
  select * into saved from public.preset_publications where curation_id=r.id;
  if found then
    if saved.review_version<>r.version or saved.public_provenance<>p_public_provenance or saved.source_groups<>groups or saved.reason<>p_reason then
      raise exception 'Publication retry differs from its recorded decision.' using errcode='23505'; end if;
  else
    insert into public.preset_publications(curation_id,review_version,public_provenance,source_groups,publisher_id,publisher_name,reason)
      values(r.id,r.version,p_public_provenance,groups,actor,name,p_reason) returning * into saved;
  end if;
  return jsonb_build_object('curationId',saved.curation_id,'reviewVersion',saved.review_version,
    'publisher',saved.publisher_name,'publishedAt',saved.published_at);
end;
$$;
create or replace function private.stage_preset_provenance_batch(p_id uuid,p_import_id uuid,p_source_sha256 text,p_schema_version integer,
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
      if existing.id::text<>entry->>'id' or private.current_preset_provenance(existing.provenance)<>private.current_preset_provenance(entry->'provenance') or existing.private_source_notes<>entry->>'privateNotes' then
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
revoke all on function private.validate_preset_provenance_v1(jsonb),private.current_preset_provenance(jsonb)
  from public,anon,authenticated;
commit;
