-- Staged membership is derived from original unit tags. It never makes a row selectable.
create view public.catalogue_staging_bank_rows with (security_invoker = true) as
select r.import_id, r.catalogue_id, i.source_bank_id as bank_id,
  r.owner_id, r.display_unit, r.unit_tags, r.selection_marks, r.provisional_difficulty
from public.catalogue_import_rows r
join public.catalogue_imports i on i.id = r.import_id and i.owner_id = r.owner_id
union all
select r.import_id, r.catalogue_id, b.id as bank_id,
  r.owner_id, r.display_unit, r.unit_tags, r.selection_marks, r.provisional_difficulty
from public.catalogue_import_rows r
join public.catalogue_imports i on i.id = r.import_id and i.owner_id = r.owner_id
join public.question_banks b on b.owner_id = r.owner_id
  and b.collection_unit = any(r.unit_tags)
  and b.id <> i.source_bank_id and not b.is_archived;

revoke all on public.catalogue_staging_bank_rows from public, anon, authenticated;
grant select on public.catalogue_staging_bank_rows to authenticated;
