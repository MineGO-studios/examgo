-- Phase 15A (MIN-19): per-teacher account limits and rates.
-- Installed in Development 18 October 2026 (remote version 20261018104448) after owner authorization.
--
-- Owner decision 18 October 2026: invite-only sign-up for the private alpha (an Auth
-- setting the owner changes) plus generous per-teacher limits as a safety net against
-- runaway scripts and bugs. Values were set at several times the heaviest real account
-- (aggregate preflight 18 October 2026: 13 banks, 1,629 questions, 15 drafts, 9 papers,
-- at most 4 papers in one hour and 1 import in one day).
--
-- Enforcement:
-- * AFTER INSERT ... FOR EACH STATEMENT triggers with transition tables, so a bulk insert
--   is checked once per statement and owner, not once per row.
-- * A transaction-scoped advisory lock per (resource, owner) serializes concurrent checks;
--   the count runs after the lock, so it sees rows committed by the previous holder.
-- * Only new rows are counted. Idempotent retries that return an existing row insert
--   nothing and are never charged. Updates, reads and existing rows are unaffected, and an
--   account already above a limit keeps everything it has.
-- * Limits are rows in private.owner_quota_limits, so they can be tuned without a migration.
--   A null value disables that check.
-- * Violations raise SQLSTATE 53400 with hint 'account-limit:<resource>:total' or
--   'account-limit:<resource>:rate' for the client to translate; no row data is echoed.

create table private.owner_quota_limits (
  resource text primary key check (resource in ('question_banks','questions','exam_drafts','exam_snapshots','catalogue_imports')),
  max_total integer check (max_total is null or max_total >= 1),
  max_in_window integer check (max_in_window is null or max_in_window >= 1),
  rate_window interval check (rate_window is null or rate_window > interval '0'),
  check ((max_in_window is null) = (rate_window is null))
);
alter table private.owner_quota_limits enable row level security;
revoke all on private.owner_quota_limits from public, anon, authenticated;

insert into private.owner_quota_limits(resource, max_total, max_in_window, rate_window) values
  ('question_banks', 50, null, null),
  ('questions', 10000, null, null),
  ('exam_drafts', 200, null, null),
  ('exam_snapshots', 500, 30, interval '1 hour'),
  ('catalogue_imports', null, 20, interval '1 day');

create function private.enforce_owner_quota()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  limits private.owner_quota_limits%rowtype;
  owner uuid;
  total bigint;
  recent bigint;
begin
  select * into limits from private.owner_quota_limits where resource = TG_TABLE_NAME;
  if not found or (limits.max_total is null and limits.max_in_window is null) then return null; end if;

  for owner in select distinct inserted.owner_id from inserted_rows inserted where inserted.owner_id is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('examgo-quota:' || TG_TABLE_NAME || ':' || owner::text, 0));
    if limits.max_total is not null then
      execute format('select count(*) from %I.%I where owner_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME) into total using owner;
      if total > limits.max_total then
        raise exception 'Account limit reached.' using errcode = '53400', hint = 'account-limit:' || TG_TABLE_NAME || ':total';
      end if;
    end if;
    if limits.max_in_window is not null then
      execute format('select count(*) from %I.%I where owner_id = $1 and created_at > now() - $2', TG_TABLE_SCHEMA, TG_TABLE_NAME)
        into recent using owner, limits.rate_window;
      if recent > limits.max_in_window then
        raise exception 'Account rate limit reached.' using errcode = '53400', hint = 'account-limit:' || TG_TABLE_NAME || ':rate';
      end if;
    end if;
  end loop;
  return null;
end
$$;

comment on function private.enforce_owner_quota() is
  'Phase 15A: statement-level per-owner limit and rate check; limits live in private.owner_quota_limits.';
revoke all on function private.enforce_owner_quota() from public, anon, authenticated;

create trigger question_banks_owner_quota after insert on public.question_banks
  referencing new table as inserted_rows for each statement execute function private.enforce_owner_quota();
create trigger questions_owner_quota after insert on public.questions
  referencing new table as inserted_rows for each statement execute function private.enforce_owner_quota();
create trigger exam_drafts_owner_quota after insert on public.exam_drafts
  referencing new table as inserted_rows for each statement execute function private.enforce_owner_quota();
create trigger exam_snapshots_owner_quota after insert on public.exam_snapshots
  referencing new table as inserted_rows for each statement execute function private.enforce_owner_quota();
create trigger catalogue_imports_owner_quota after insert on public.catalogue_imports
  referencing new table as inserted_rows for each statement execute function private.enforce_owner_quota();

-- Supports the rolling-window counts.
create index if not exists exam_snapshots_owner_created_idx on public.exam_snapshots(owner_id, created_at);
create index if not exists catalogue_imports_owner_created_idx on public.catalogue_imports(owner_id, created_at);
