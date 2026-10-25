alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter table public.question_banks
  add constraint question_banks_id_owner_key
  unique (id, owner_id);

alter table public.exam_drafts
  add constraint exam_drafts_id_owner_key
  unique (id, owner_id);

alter table public.questions
  add column owner_id uuid,
  add column schema_version smallint not null default 1,
  add column marks smallint not null default 1,
  add column content jsonb,
  add column answer jsonb,
  add column current_revision integer not null default 1;

alter table public.questions
  disable trigger questions_set_updated_at;

update public.questions as question
set
  owner_id = bank.owner_id,
  content = jsonb_build_object(
    'type', 'multiple-choice',
    'schemaVersion', 1,
    'options', question.options
  ),
  answer = jsonb_build_object(
    'type', 'multiple-choice',
    'schemaVersion', 1,
    'correctOptionLabel', question.correct_option_label
  )
from public.question_banks as bank
where bank.id = question.bank_id;

alter table public.questions
  enable trigger questions_set_updated_at;

alter table public.questions
  alter column owner_id set not null,
  alter column owner_id set default auth.uid(),
  alter column content set not null,
  alter column answer set not null,
  alter column options drop not null,
  alter column correct_option_label drop not null,
  drop constraint questions_question_type_check,
  add constraint questions_owner_id_fkey
    foreign key (owner_id)
    references auth.users(id)
    on delete cascade,
  add constraint questions_id_owner_key
    unique (id, owner_id),
  add constraint questions_bank_owner_fkey
    foreign key (bank_id, owner_id)
    references public.question_banks(id, owner_id)
    on delete cascade,
  add constraint questions_question_type_check
    check (
      question_type in (
        'multiple-choice',
        'binary',
        'short-answer',
        'completion',
        'odd-word',
        'matching',
        'word-relationship',
        'rewrite',
        'extended-writing'
      )
    ),
  add constraint questions_schema_version_check
    check (schema_version between 1 and 32767),
  add constraint questions_marks_check
    check (marks between 1 and 100),
  add constraint questions_current_revision_check
    check (current_revision >= 1),
  add constraint questions_content_envelope_check
    check (
      jsonb_typeof(content) = 'object'
      and content ->> 'type' = question_type
      and case
        when jsonb_typeof(content -> 'schemaVersion') = 'number'
          then content ->> 'schemaVersion' = schema_version::text
        else false
      end
    ),
  add constraint questions_answer_envelope_check
    check (
      jsonb_typeof(answer) = 'object'
      and answer ->> 'type' = question_type
      and case
        when jsonb_typeof(answer -> 'schemaVersion') = 'number'
          then answer ->> 'schemaVersion' = schema_version::text
        else false
      end
    );

create index questions_owner_selector_idx
  on public.questions (
    owner_id,
    is_active,
    unit,
    question_type,
    difficulty
  );

create table public.question_revisions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision >= 1),
  bank_id uuid not null,
  external_id text not null
    check (char_length(btrim(external_id)) between 1 and 80),
  unit smallint not null check (unit between 1 and 20),
  lesson text not null
    check (char_length(btrim(lesson)) between 1 and 40),
  question_type text not null,
  schema_version smallint not null
    check (schema_version between 1 and 32767),
  difficulty text not null
    check (difficulty in ('easy', 'medium', 'hard')),
  prompt text not null
    check (char_length(btrim(prompt)) between 1 and 2000),
  marks smallint not null check (marks between 1 and 100),
  content jsonb not null,
  answer jsonb not null,
  is_active boolean not null,
  created_at timestamptz not null default now(),
  constraint question_revisions_question_owner_fkey
    foreign key (question_id, owner_id)
    references public.questions(id, owner_id)
    on delete restrict,
  constraint question_revisions_bank_owner_fkey
    foreign key (bank_id, owner_id)
    references public.question_banks(id, owner_id)
    on delete restrict,
  constraint question_revisions_question_revision_key
    unique (question_id, revision),
  constraint question_revisions_id_owner_key
    unique (id, owner_id),
  constraint question_revisions_question_type_check
    check (
      question_type in (
        'multiple-choice',
        'binary',
        'short-answer',
        'completion',
        'odd-word',
        'matching',
        'word-relationship',
        'rewrite',
        'extended-writing'
      )
    ),
  constraint question_revisions_content_envelope_check
    check (
      jsonb_typeof(content) = 'object'
      and content ->> 'type' = question_type
      and case
        when jsonb_typeof(content -> 'schemaVersion') = 'number'
          then content ->> 'schemaVersion' = schema_version::text
        else false
      end
    ),
  constraint question_revisions_answer_envelope_check
    check (
      jsonb_typeof(answer) = 'object'
      and answer ->> 'type' = question_type
      and case
        when jsonb_typeof(answer -> 'schemaVersion') = 'number'
          then answer ->> 'schemaVersion' = schema_version::text
        else false
      end
    )
);

create index question_revisions_owner_question_idx
  on public.question_revisions (owner_id, question_id, revision desc);

insert into public.question_revisions (
  question_id,
  owner_id,
  revision,
  bank_id,
  external_id,
  unit,
  lesson,
  question_type,
  schema_version,
  difficulty,
  prompt,
  marks,
  content,
  answer,
  is_active,
  created_at
)
select
  id,
  owner_id,
  current_revision,
  bank_id,
  external_id,
  unit,
  lesson,
  question_type,
  schema_version,
  difficulty,
  prompt,
  marks,
  content,
  answer,
  is_active,
  updated_at
from public.questions;

create or replace function private.prepare_question_domain()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  semantic_changed boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id then
      raise exception 'Question identity cannot be changed.'
        using errcode = '23514';
    end if;

    if new.owner_id <> old.owner_id then
      raise exception 'Question ownership cannot be changed.'
        using errcode = '23514';
    end if;
  end if;

  if new.question_type = 'multiple-choice' then
    if tg_op = 'INSERT' then
      if new.content is null then
        new.content := jsonb_build_object(
          'type', 'multiple-choice',
          'schemaVersion', new.schema_version,
          'options', new.options
        );
      end if;

      if new.answer is null then
        new.answer := jsonb_build_object(
          'type', 'multiple-choice',
          'schemaVersion', new.schema_version,
          'correctOptionLabel', new.correct_option_label
        );
      end if;
    else
      if new.options is distinct from old.options
        and new.content is not distinct from old.content then
        new.content := jsonb_build_object(
          'type', 'multiple-choice',
          'schemaVersion', new.schema_version,
          'options', new.options
        );
      elsif new.content is distinct from old.content
        and new.options is not distinct from old.options then
        new.options := new.content -> 'options';
      end if;

      if new.correct_option_label is distinct from old.correct_option_label
        and new.answer is not distinct from old.answer then
        new.answer := jsonb_build_object(
          'type', 'multiple-choice',
          'schemaVersion', new.schema_version,
          'correctOptionLabel', new.correct_option_label
        );
      elsif new.answer is distinct from old.answer
        and new.correct_option_label is not distinct from old.correct_option_label then
        new.correct_option_label := new.answer ->> 'correctOptionLabel';
      end if;
    end if;

    if new.options is null
      or new.correct_option_label is null
      or new.content -> 'options' is distinct from new.options
      or new.answer ->> 'correctOptionLabel'
        is distinct from new.correct_option_label then
      raise exception 'Multiple-choice legacy and typed payloads must agree.'
        using errcode = '23514';
    end if;
  elsif new.options is not null or new.correct_option_label is not null then
    raise exception 'Legacy answer columns are only valid for multiple-choice questions.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.current_revision := 1;
  else
    semantic_changed := row(
      new.bank_id,
      new.external_id,
      new.unit,
      new.lesson,
      new.question_type,
      new.schema_version,
      new.difficulty,
      new.prompt,
      new.marks,
      new.content,
      new.answer,
      new.is_active
    ) is distinct from row(
      old.bank_id,
      old.external_id,
      old.unit,
      old.lesson,
      old.question_type,
      old.schema_version,
      old.difficulty,
      old.prompt,
      old.marks,
      old.content,
      old.answer,
      old.is_active
    );

    new.current_revision := case
      when semantic_changed then old.current_revision + 1
      else old.current_revision
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_question_domain()
from public, anon, authenticated;

create or replace function private.capture_question_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or new.current_revision <> old.current_revision then
    insert into public.question_revisions (
      question_id,
      owner_id,
      revision,
      bank_id,
      external_id,
      unit,
      lesson,
      question_type,
      schema_version,
      difficulty,
      prompt,
      marks,
      content,
      answer,
      is_active
    ) values (
      new.id,
      new.owner_id,
      new.current_revision,
      new.bank_id,
      new.external_id,
      new.unit,
      new.lesson,
      new.question_type,
      new.schema_version,
      new.difficulty,
      new.prompt,
      new.marks,
      new.content,
      new.answer,
      new.is_active
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_question_revision()
from public, anon, authenticated;

create trigger questions_prepare_domain
before insert or update on public.questions
for each row execute function private.prepare_question_domain();

create trigger questions_capture_revision
after insert or update on public.questions
for each row execute function private.capture_question_revision();

create table public.question_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  group_type text not null
    check (
      group_type in (
        'passage',
        'main-question',
        'branch',
        'alternative-choice'
      )
    ),
  schema_version smallint not null default 1
    check (schema_version between 1 and 32767),
  parent_group_id uuid,
  position smallint check (position between 1 and 100),
  label text check (label is null or char_length(btrim(label)) between 1 and 20),
  title text check (title is null or char_length(btrim(title)) between 1 and 200),
  instructions text
    check (instructions is null or char_length(btrim(instructions)) between 1 and 1000),
  content jsonb not null,
  attempt_count smallint check (attempt_count between 1 and 100),
  expected_marks smallint check (expected_marks between 1 and 1000),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_groups_id_owner_key unique (id, owner_id),
  constraint question_groups_parent_owner_fkey
    foreign key (parent_group_id, owner_id)
    references public.question_groups(id, owner_id)
    on delete cascade,
  constraint question_groups_parent_position_check
    check (
      (parent_group_id is null and position is null)
      or (parent_group_id is not null and position is not null)
    ),
  constraint question_groups_content_envelope_check
    check (
      jsonb_typeof(content) = 'object'
      and content ->> 'type' = group_type
      and case
        when jsonb_typeof(content -> 'schemaVersion') = 'number'
          then content ->> 'schemaVersion' = schema_version::text
        else false
      end
    )
);

create unique index question_groups_parent_position_uidx
  on public.question_groups (parent_group_id, position)
  where parent_group_id is not null;

create unique index question_groups_parent_label_uidx
  on public.question_groups (parent_group_id, lower(label))
  where parent_group_id is not null and label is not null;

create index question_groups_owner_idx
  on public.question_groups (owner_id, updated_at desc);

create or replace function private.prepare_question_group()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_cycle boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id then
      raise exception 'Question group identity cannot be changed.'
        using errcode = '23514';
    end if;

    if new.owner_id <> old.owner_id then
      raise exception 'Question group ownership cannot be changed.'
        using errcode = '23514';
    end if;
  end if;

  if new.parent_group_id = new.id then
    raise exception 'A question group cannot contain itself.'
      using errcode = '23514';
  end if;

  if new.parent_group_id is not null then
    with recursive ancestors as (
      select id, parent_group_id
      from public.question_groups
      where id = new.parent_group_id
        and owner_id = new.owner_id

      union all

      select parent.id, parent.parent_group_id
      from public.question_groups as parent
      join ancestors on parent.id = ancestors.parent_group_id
      where parent.owner_id = new.owner_id
    )
    select exists (
      select 1 from ancestors where id = new.id
    ) into has_cycle;

    if has_cycle then
      raise exception 'Question group relationships cannot contain a cycle.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.revision := case
      when row(
        new.group_type,
        new.schema_version,
        new.parent_group_id,
        new.position,
        new.label,
        new.title,
        new.instructions,
        new.content,
        new.attempt_count,
        new.expected_marks
      ) is distinct from row(
        old.group_type,
        old.schema_version,
        old.parent_group_id,
        old.position,
        old.label,
        old.title,
        old.instructions,
        old.content,
        old.attempt_count,
        old.expected_marks
      ) then old.revision + 1
      else old.revision
    end;
  else
    new.revision := 1;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_question_group()
from public, anon, authenticated;

create trigger question_groups_prepare_domain
before insert or update on public.question_groups
for each row execute function private.prepare_question_group();

create trigger question_groups_set_updated_at
before update on public.question_groups
for each row execute function private.set_updated_at();

create table public.question_group_questions (
  group_id uuid not null,
  question_id uuid not null,
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (group_id, question_id),
  constraint question_group_questions_group_owner_fkey
    foreign key (group_id, owner_id)
    references public.question_groups(id, owner_id)
    on delete cascade,
  constraint question_group_questions_question_owner_fkey
    foreign key (question_id, owner_id)
    references public.questions(id, owner_id)
    on delete restrict,
  constraint question_group_questions_group_position_key
    unique (group_id, position)
);

create index question_group_questions_question_idx
  on public.question_group_questions (question_id);

create table public.exam_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  source_draft_id uuid,
  schema_version smallint not null default 1
    check (schema_version between 1 and 32767),
  selection_seed bigint not null
    check (selection_seed between 0 and 4294967295),
  settings jsonb not null,
  structure jsonb not null,
  total_marks smallint not null check (total_marks between 1 and 1000),
  document_status text not null default 'ready'
    check (document_status in ('ready', 'needs-review')),
  two_page_approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint exam_snapshots_id_owner_key unique (id, owner_id),
  constraint exam_snapshots_source_draft_owner_fkey
    foreign key (source_draft_id, owner_id)
    references public.exam_drafts(id, owner_id)
    on delete restrict,
  constraint exam_snapshots_two_page_check
    check (
      not two_page_approved
      or document_status = 'needs-review'
    ),
  constraint exam_snapshots_settings_envelope_check
    check (
      jsonb_typeof(settings) = 'object'
      and case
        when jsonb_typeof(settings -> 'schemaVersion') = 'number'
          then settings ->> 'schemaVersion' = schema_version::text
        else false
      end
    ),
  constraint exam_snapshots_structure_envelope_check
    check (
      jsonb_typeof(structure) = 'object'
      and case
        when jsonb_typeof(structure -> 'schemaVersion') = 'number'
          then structure ->> 'schemaVersion' = schema_version::text
        else false
      end
    )
);

create index exam_snapshots_owner_created_idx
  on public.exam_snapshots (owner_id, created_at desc);

create table public.exam_snapshot_questions (
  snapshot_id uuid not null,
  question_revision_id uuid not null,
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 200),
  is_locked boolean not null default false,
  source_group_id uuid,
  structure_path jsonb not null default '[]'::jsonb
    check (jsonb_typeof(structure_path) = 'array'),
  visible_number text
    check (
      visible_number is null
      or char_length(btrim(visible_number)) between 1 and 40
    ),
  created_at timestamptz not null default now(),
  primary key (snapshot_id, question_revision_id),
  constraint exam_snapshot_questions_snapshot_owner_fkey
    foreign key (snapshot_id, owner_id)
    references public.exam_snapshots(id, owner_id)
    on delete cascade,
  constraint exam_snapshot_questions_revision_owner_fkey
    foreign key (question_revision_id, owner_id)
    references public.question_revisions(id, owner_id)
    on delete restrict,
  constraint exam_snapshot_questions_group_owner_fkey
    foreign key (source_group_id, owner_id)
    references public.question_groups(id, owner_id)
    on delete restrict,
  constraint exam_snapshot_questions_snapshot_position_key
    unique (snapshot_id, position)
);

create index exam_snapshot_questions_revision_idx
  on public.exam_snapshot_questions (question_revision_id);

alter table public.question_revisions enable row level security;
alter table public.question_groups enable row level security;
alter table public.question_group_questions enable row level security;
alter table public.exam_snapshots enable row level security;
alter table public.exam_snapshot_questions enable row level security;

drop policy questions_owner_access on public.questions;

create policy questions_owner_access
on public.questions
for all
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.question_banks as bank
    where bank.id = questions.bank_id
      and bank.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.question_banks as bank
    where bank.id = questions.bank_id
      and bank.owner_id = (select auth.uid())
  )
);

create policy question_revisions_owner_read
on public.question_revisions
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy question_groups_owner_access
on public.question_groups
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy question_group_questions_owner_access
on public.question_group_questions
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy exam_snapshots_owner_read
on public.exam_snapshots
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy exam_snapshots_owner_insert
on public.exam_snapshots
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy exam_snapshot_questions_owner_read
on public.exam_snapshot_questions
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy exam_snapshot_questions_owner_insert
on public.exam_snapshot_questions
for insert
to authenticated
with check (owner_id = (select auth.uid()));

revoke all on table
  public.question_revisions,
  public.question_groups,
  public.question_group_questions,
  public.exam_snapshots,
  public.exam_snapshot_questions
from anon, authenticated;

grant select on table public.question_revisions to authenticated;

grant select, insert, update, delete on table
  public.question_groups,
  public.question_group_questions
to authenticated;

grant select, insert on table
  public.exam_snapshots,
  public.exam_snapshot_questions
to authenticated;

grant all on table
  public.question_revisions,
  public.question_groups,
  public.question_group_questions,
  public.exam_snapshots,
  public.exam_snapshot_questions
to service_role;

revoke all on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
from anon;
