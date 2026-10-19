-- Staging accepts the same unit range as canonical questions. The current
-- Papers release still populates only Unit 1–4 collections.
alter table public.catalogue_import_rows
  drop constraint catalogue_import_rows_unit_tags_check,
  drop constraint catalogue_import_rows_display_unit_check,
  drop constraint catalogue_import_rows_check,
  add constraint catalogue_import_rows_unit_tags_check
    check (cardinality(unit_tags) between 1 and 20
      and array_position(unit_tags, null) is null
      and unit_tags <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]::smallint[]),
  add constraint catalogue_import_rows_display_unit_check
    check (display_unit between 1 and 20),
  add constraint catalogue_import_rows_check
    check (display_unit = any(unit_tags) and display_unit >= all(unit_tags));
