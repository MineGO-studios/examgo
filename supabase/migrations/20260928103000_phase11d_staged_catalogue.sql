-- Unresolved source records stay outside selectable questions and snapshots.
create table public.catalogue_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_namespace text not null check (char_length(btrim(source_namespace)) between 1 and 100),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_bank_id uuid not null,
  expected_rows integer not null check (expected_rows between 1 and 10000),
  format_version smallint not null default 1 check (format_version = 1),
  created_at timestamptz not null default now(),
  unique (owner_id, source_namespace, source_sha256),
  unique (id, owner_id),
  foreign key (source_bank_id, owner_id) references public.question_banks(id, owner_id)
);

create table public.catalogue_import_rows (
  import_id uuid not null,
  owner_id uuid not null default auth.uid(),
  catalogue_id text not null check (char_length(btrim(catalogue_id)) between 1 and 100),
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  source_fields jsonb not null check (jsonb_typeof(source_fields) = 'object'),
  unit_tags smallint[] not null check (cardinality(unit_tags) between 1 and 4),
  display_unit smallint not null check (display_unit between 1 and 4),
  group_ids text[] not null default '{}',
  provisional_difficulty text not null default 'medium' check (provisional_difficulty = 'medium'),
  selection_marks smallint check (selection_marks between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (import_id, catalogue_id),
  foreign key (import_id, owner_id) references public.catalogue_imports(id, owner_id) on delete cascade,
  check (display_unit = greatest(unit_tags[1], unit_tags[2], unit_tags[3], unit_tags[4]))
);

create index catalogue_import_rows_owner_unit_idx
  on public.catalogue_import_rows(owner_id, display_unit);

alter table public.catalogue_imports enable row level security;
alter table public.catalogue_import_rows enable row level security;
revoke all on public.catalogue_imports, public.catalogue_import_rows from public, anon, authenticated;
grant select, insert on public.catalogue_imports to authenticated;
grant select, insert on public.catalogue_import_rows to authenticated;

create policy catalogue_imports_owner_read on public.catalogue_imports
  for select to authenticated using (owner_id = (select auth.uid()));
create policy catalogue_imports_owner_insert on public.catalogue_imports
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.question_banks b
      where b.id = catalogue_imports.source_bank_id
        and b.owner_id = catalogue_imports.owner_id and not b.is_archived
    )
  );
create policy catalogue_import_rows_owner_read on public.catalogue_import_rows
  for select to authenticated using (owner_id = (select auth.uid()));
create policy catalogue_import_rows_owner_insert on public.catalogue_import_rows
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and selection_marks is null
    and provisional_difficulty = 'medium'
    and source_fields->>'catalogue_id' = catalogue_id
    and source_fields->>'unit' ~ '^[1-4](,[1-4])*$'
    and unit_tags = string_to_array(source_fields->>'unit', ',')::smallint[]
  );
