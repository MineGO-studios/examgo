-- Sixth Primary English has eight units. Keep the already-applied widening
-- migration in history, then narrow teacher intake to the actual book range.
alter table public.catalogue_import_rows
  drop constraint catalogue_import_rows_unit_tags_check,
  drop constraint catalogue_import_rows_display_unit_check,
  add constraint catalogue_import_rows_unit_tags_check
    check (cardinality(unit_tags) between 1 and 8
      and array_position(unit_tags, null) is null
      and unit_tags <@ array[1,2,3,4,5,6,7,8]::smallint[]),
  add constraint catalogue_import_rows_display_unit_check
    check (display_unit between 1 and 8);
