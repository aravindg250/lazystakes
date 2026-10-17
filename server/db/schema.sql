-- =====================================================================
-- LazyStakes — Postgres schema (v1, honor system)
--
-- Run once against a fresh Supabase project (SQL editor → paste → Run),
-- or `psql "$DATABASE_URL" -f db/schema.sql`. The test suite runs this same
-- file against an in-process Postgres, so it is the single source of truth.
--
-- Conventions that matter more than they look:
--   * Money is integer cents. Never numeric, never float.
--   * Every timestamp is timestamptz. Local dates are `date` plus the
--     commitment's IANA timezone, never a bare local timestamp.
--   * Financial rows never cascade away. Deleting a commitment archives it.
--
-- Not in this file yet (Phase 3): the foreign key from users.id to
-- Supabase's auth.users, and row-level security policies. RLS must be on
-- before any real user data exists — see docs/specsheet.md.
-- =====================================================================

create type commitment_status as enum ('active', 'paused', 'archived');
create type check_in_status   as enum ('pending', 'verified', 'excused', 'missed');
create type evidence_kind     as enum ('self_report');
create type charge_status     as enum ('pending', 'processing', 'succeeded', 'failed', 'refunded');
create type notification_kind as enum ('reminder', 'final_warning', 'charge_receipt');
create type notification_status as enum ('sending', 'sent', 'failed');

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
-- Phase 3 makes `id` reference auth.users(id). Until then rows are
-- inserted by hand or by scripts/seed.ts.

create table users (
  id                  uuid primary key default gen_random_uuid(),
  apple_sub           text unique,
  email               text,
  timezone            text not null,                     -- IANA, e.g. America/New_York
  stripe_customer_id  text unique,
  expo_push_token     text,
  remind_enabled      boolean not null default true,     -- 6 pm reminder
  final_warning_enabled boolean not null default true,   -- 10 pm warning
  receipts_enabled    boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- payment_methods — references to Stripe, never card numbers
-- ---------------------------------------------------------------------

create table payment_methods (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users(id) on delete cascade,
  stripe_payment_method_id  text not null unique,
  brand                     text not null,
  last4                     text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month                 int  not null check (exp_month between 1 and 12),
  exp_year                  int  not null,
  is_default                boolean not null default false,
  created_at                timestamptz not null default now()
);

-- One default card per user.
create unique index payment_methods_one_default
  on payment_methods (user_id) where is_default;

-- ---------------------------------------------------------------------
-- commitments
-- ---------------------------------------------------------------------

create table commitments (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete restrict,
  title                  text not null check (length(trim(title)) between 1 and 120),
  -- ISO weekdays, 1 = Monday … 7 = Sunday (matches Luxon and src/types).
  schedule_days          smallint[] not null
                           check (cardinality(schedule_days) between 1 and 7
                                  and schedule_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  -- Honor-system cap. When verified proof types arrive, this check is
  -- replaced by one that depends on the commitment's accepted proofs.
  stake_cents            int  not null check (stake_cents between 100 and 2000),
  -- Snapshotted at creation. Travel never moves a deadline.
  timezone               text not null,
  deadline_local_time    time not null default '23:59',
  free_passes_per_month  smallint not null default 1 check (free_passes_per_month between 0 and 4),
  status                 commitment_status not null default 'active',
  -- First local date that can be scheduled. Set to "tomorrow" at creation
  -- and on resume, so a new or resumed commitment can never charge same-day.
  starts_on              date not null,
  paused_at              timestamptz,
  archived_at            timestamptz,
  created_at             timestamptz not null default now()
);

create index commitments_user on commitments (user_id);
create index commitments_active on commitments (id) where status = 'active';

-- ---------------------------------------------------------------------
-- check_ins — one commitment on one local date
-- ---------------------------------------------------------------------
-- Created ahead of time by materializeCheckIns. Resolves exactly once.

create table check_ins (
  id              uuid primary key default gen_random_uuid(),
  commitment_id   uuid not null references commitments(id) on delete restrict,
  user_id         uuid not null references users(id) on delete restrict,
  due_date        date not null,
  -- Precomputed from the commitment's timezone, so the deadline job is one
  -- indexed query rather than timezone arithmetic per row.
  deadline_utc    timestamptz not null,
  -- Snapshot, not a reference: raising a stake never rewrites past days.
  stake_cents     int not null check (stake_cents > 0),
  status          check_in_status not null default 'pending',
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (commitment_id, due_date),
  check ((status = 'pending') = (resolved_at is null))
);

-- The single most important index: the deadline job's query, every 15 min.
create index check_ins_pending_deadline
  on check_ins (deadline_utc) where status = 'pending';

create index check_ins_user_date on check_ins (user_id, due_date desc);

-- Terminal states never change. Corrections happen as refunds on the
-- charge, never as status edits, so history always matches the bank.
create function check_ins_terminal_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'check-in % is already %, terminal states cannot change', old.id, old.status;
  end if;
  return new;
end $$;

create trigger check_ins_terminal_guard
  before update on check_ins
  for each row execute function check_ins_terminal_guard();

-- ---------------------------------------------------------------------
-- evidence — why a check-in counts
-- ---------------------------------------------------------------------
-- v1: one kind, `self_report` (the user held Mark done). Undo sets
-- withdrawn_at rather than deleting, so the trail survives a dispute.

create table evidence (
  id                  uuid primary key default gen_random_uuid(),
  check_in_id         uuid not null references check_ins(id) on delete restrict,
  user_id             uuid not null references users(id) on delete restrict,
  kind                evidence_kind not null,
  -- The only time that counts. Set by the database, never by the client.
  server_received_at  timestamptz not null default now(),
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now(),
  check (withdrawn_at is null or withdrawn_at >= server_received_at)
);

-- At most one live self-report per check-in; repeat marks are idempotent.
create unique index evidence_one_live_self_report
  on evidence (check_in_id) where kind = 'self_report' and withdrawn_at is null;

-- ---------------------------------------------------------------------
-- charges — exactly one per missed check-in
-- ---------------------------------------------------------------------

create table charges (
  id                        uuid primary key default gen_random_uuid(),
  check_in_id               uuid not null unique references check_ins(id) on delete restrict,
  user_id                   uuid not null references users(id) on delete restrict,
  amount_cents              int  not null check (amount_cents > 0),
  currency                  text not null default 'usd',
  status                    charge_status not null default 'pending',
  -- Always `checkin_<check_in_id>`, never random. Used to create the
  -- PaymentIntent, so a retry after a timeout returns the original.
  idempotency_key           text not null unique,
  stripe_payment_intent_id  text unique,
  -- attempts only ever counts up (it feeds Stripe retry idempotency keys);
  -- a requeue after a card fix raises max_attempts instead of resetting it.
  attempts                  smallint not null default 0,
  max_attempts              smallint not null default 3,
  next_attempt_at           timestamptz not null default now(),
  locked_at                 timestamptz,
  last_error_code           text,
  last_error_message        text,
  succeeded_at              timestamptz,
  failed_at                 timestamptz,
  refunded_at               timestamptz,
  created_at                timestamptz not null default now(),
  check (idempotency_key = 'checkin_' || check_in_id::text)
);

create index charges_due on charges (next_attempt_at) where status = 'pending';
create index charges_user on charges (user_id, created_at desc);

-- A user with a charge that failed after every retry can't create new
-- commitments until it's paid. Derived from charges rather than stored as a
-- flag, so it can never drift out of sync.
create index charges_failed_by_user on charges (user_id) where status = 'failed';

-- ---------------------------------------------------------------------
-- free_pass_usage
-- ---------------------------------------------------------------------

create table free_pass_usage (
  id              uuid primary key default gen_random_uuid(),
  commitment_id   uuid not null references commitments(id) on delete restrict,
  check_in_id     uuid not null unique references check_ins(id) on delete restrict,
  month           date not null check (extract(day from month) = 1),  -- first of the local month
  created_at      timestamptz not null default now()
);

create index free_pass_usage_month on free_pass_usage (commitment_id, month);

-- ---------------------------------------------------------------------
-- consent_records — chargeback evidence
-- ---------------------------------------------------------------------

create table consent_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete restrict,
  commitment_id   uuid not null references commitments(id) on delete restrict,
  consent_text    text not null,        -- the exact language shown and agreed to
  ip_address      inet,
  user_agent      text,
  accepted_at     timestamptz not null default now()
);

create index consent_records_commitment on consent_records (commitment_id);

-- ---------------------------------------------------------------------
-- notifications_log — what was actually sent
-- ---------------------------------------------------------------------
-- Rows are inserted as 'sending' before the push goes out (the unique key
-- stops a second worker sending the same warning) and marked 'sent' only
-- after the push service accepts it. Only 'sent' rows count as evidence.

create table notifications_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete restrict,
  check_in_id     uuid references check_ins(id) on delete restrict,
  charge_id       uuid references charges(id) on delete restrict,
  kind            notification_kind not null,
  status          notification_status not null default 'sending',
  push_ticket_id  text,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create unique index notifications_once_per_check_in
  on notifications_log (check_in_id, kind) where check_in_id is not null;
create unique index notifications_once_per_charge
  on notifications_log (charge_id, kind) where charge_id is not null;
