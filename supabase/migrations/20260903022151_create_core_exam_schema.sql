create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at()
from public, anon, authenticated;

create table public.question_banks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 100),
  grade smallint not null check (grade between 1 and 12),
  subject text not null default 'English'
    check (char_length(btrim(subject)) between 1 and 60),
  curriculum text not null default 'Iraqi mainstream'
    check (char_length(btrim(curriculum)) between 1 and 100),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index question_banks_owner_name_active_uidx
  on public.question_banks (owner_id, lower(name))
  where not is_archived;

create index question_banks_owner_idx
  on public.question_banks (owner_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null
    references public.question_banks(id) on delete cascade,
  external_id text not null
    check (char_length(btrim(external_id)) between 1 and 80),
  unit smallint not null check (unit between 1 and 20),
  lesson text not null
    check (char_length(btrim(lesson)) between 1 and 40),
  question_type text not null default 'multiple-choice'
    check (question_type in ('multiple-choice')),
  difficulty text not null
    check (difficulty in ('easy', 'medium', 'hard')),
  prompt text not null
    check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null
    check (
      jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 6
    ),
  correct_option_label text not null
    check (
      char_length(btrim(correct_option_label)) between 1 and 10
    ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_id, external_id)
);

create index questions_selector_idx
  on public.questions (
    bank_id,
    is_active,
    unit,
    question_type,
    difficulty
  );

create index questions_bank_lesson_idx
  on public.questions (bank_id, lesson);

create table public.exam_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bank_id uuid not null
    references public.question_banks(id) on delete restrict,
  exam_title text not null
    check (char_length(btrim(exam_title)) between 1 and 80),
  school_name text not null
    check (char_length(btrim(school_name)) between 1 and 80),
  grade smallint not null check (grade between 1 and 12),
  unit smallint not null check (unit between 1 and 20),
  marks_per_question smallint not null
    check (marks_per_question between 1 and 20),
  question_count smallint not null
    check (question_count between 1 and 50),
  selection_seed bigint not null
    check (selection_seed between 0 and 4294967295),
  status text not null default 'draft'
    check (status in ('draft', 'generated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exam_drafts_owner_updated_idx
  on public.exam_drafts (owner_id, updated_at desc);

create index exam_drafts_bank_idx
  on public.exam_drafts (bank_id);

create table public.exam_draft_questions (
  exam_draft_id uuid not null
    references public.exam_drafts(id) on delete cascade,
  question_id uuid not null
    references public.questions(id) on delete restrict,
  position smallint not null check (position between 1 and 50),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (exam_draft_id, question_id),
  unique (exam_draft_id, position)
);

create index exam_draft_questions_question_idx
  on public.exam_draft_questions (question_id);

create trigger question_banks_set_updated_at
before update on public.question_banks
for each row execute function private.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row execute function private.set_updated_at();

create trigger exam_drafts_set_updated_at
before update on public.exam_drafts
for each row execute function private.set_updated_at();

alter table public.question_banks enable row level security;
alter table public.questions enable row level security;
alter table public.exam_drafts enable row level security;
alter table public.exam_draft_questions enable row level security;

revoke all on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
from anon;

grant select, insert, update, delete on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
to authenticated;

grant all on table
  public.question_banks,
  public.questions,
  public.exam_drafts,
  public.exam_draft_questions
to service_role;
