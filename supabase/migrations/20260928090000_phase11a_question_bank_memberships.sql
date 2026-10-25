-- A question keeps its existing source bank; additional banks only reference it.
alter table public.question_banks
  add column collection_unit smallint check (collection_unit between 1 and 20);

create table public.question_bank_memberships (
  bank_id uuid not null,
  question_id uuid not null,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (bank_id, question_id),
  constraint question_bank_memberships_bank_owner_fkey
    foreign key (bank_id, owner_id)
    references public.question_banks(id, owner_id)
    on delete cascade,
  constraint question_bank_memberships_question_owner_fkey
    foreign key (question_id, owner_id)
    references public.questions(id, owner_id)
    on delete cascade
);

create index question_bank_memberships_question_owner_idx
  on public.question_bank_memberships (question_id, owner_id);
create index question_bank_memberships_owner_idx
  on public.question_bank_memberships (owner_id);

-- Backfill before any new reader uses membership, preserving every old bank.
insert into public.question_bank_memberships (bank_id, question_id, owner_id)
select bank_id, id, owner_id from public.questions;

create function private.add_source_bank_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.question_bank_memberships (bank_id, question_id, owner_id)
  values (new.bank_id, new.id, new.owner_id)
  on conflict (bank_id, question_id) do nothing;
  return new;
end;
$$;

revoke all on function private.add_source_bank_membership()
from public, anon, authenticated;

create trigger questions_add_source_bank_membership
after insert or update of bank_id on public.questions
for each row execute function private.add_source_bank_membership();

alter table public.question_bank_memberships enable row level security;
revoke all on public.question_bank_memberships from public, anon, authenticated;
grant select, insert, delete on public.question_bank_memberships to authenticated;

create policy question_bank_memberships_owner_read
on public.question_bank_memberships for select to authenticated
using (owner_id = (select auth.uid()));

create policy question_bank_memberships_owner_insert
on public.question_bank_memberships for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.question_banks b
    where b.id = question_bank_memberships.bank_id
      and b.owner_id = question_bank_memberships.owner_id
      and not b.is_archived
  )
);

-- Removing a derived membership never deletes its canonical question.
-- The source membership remains until the question itself is removed.
create policy question_bank_memberships_owner_delete
on public.question_bank_memberships for delete to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.questions q
    where q.id = question_bank_memberships.question_id
      and q.owner_id = question_bank_memberships.owner_id
      and q.bank_id <> question_bank_memberships.bank_id
  )
);
