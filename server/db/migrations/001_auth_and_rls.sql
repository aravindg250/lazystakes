-- =====================================================================
-- 001 — tie users to Supabase sign-ins, and lock the tables down
--
-- Run after schema.sql (SQL editor → paste → Run). Safe to run twice.
--
-- How access works:
--   * The app never talks to these tables. It signs in with Supabase Auth
--     and calls the Railway API with the session token; the API checks the
--     token and enforces every rule.
--   * The API connects as `postgres`, which bypasses row-level security.
--   * The app's Supabase key (anon, public by design) and signed-in
--     sessions (authenticated) could still reach the tables through
--     Supabase's REST endpoint. So: RLS on everywhere, read-only access to
--     your own rows, and no write grants at all. Writes go through the API,
--     because direct writes would skip its rules (deadlines, stake limits,
--     consent, billing blocks).
-- =====================================================================

-- ---------------------------------------------------------------------
-- users.id is the Supabase Auth user id
-- ---------------------------------------------------------------------
-- The API creates the users row on the first signed-in request.
-- `on delete restrict`: an auth user with charge history can't be deleted
-- out from under it. Account deletion (Phase 5) is a deliberate flow.
-- NOT VALID: rows created before this migration (test scripts) aren't
-- checked; every new row is.

alter table users alter column id drop default;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_id_auth_fk') then
    alter table users
      add constraint users_id_auth_fk foreign key (id) references auth.users (id)
      on delete restrict not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------

alter table users             enable row level security;
alter table payment_methods   enable row level security;
alter table commitments       enable row level security;
alter table check_ins         enable row level security;
alter table evidence          enable row level security;
alter table charges           enable row level security;
alter table free_pass_usage   enable row level security;
alter table consent_records   enable row level security;
alter table notifications_log enable row level security;

-- Nothing for the public key; read-only for signed-in users. Supabase
-- grants everything to these roles by default, so take it back.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- And for tables created later, so a future migration can't forget.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant select on users, payment_methods, commitments, check_ins, evidence,
                charges, consent_records, notifications_log
  to authenticated;
-- free_pass_usage: internal bookkeeping, no client access.

-- Your own rows only. `(select auth.uid())` is evaluated once per query
-- rather than once per row.
drop policy if exists users_select_own on users;
create policy users_select_own on users
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists payment_methods_select_own on payment_methods;
create policy payment_methods_select_own on payment_methods
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists commitments_select_own on commitments;
create policy commitments_select_own on commitments
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists check_ins_select_own on check_ins;
create policy check_ins_select_own on check_ins
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists evidence_select_own on evidence;
create policy evidence_select_own on evidence
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists charges_select_own on charges;
create policy charges_select_own on charges
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists consent_records_select_own on consent_records;
create policy consent_records_select_own on consent_records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_log_select_own on notifications_log;
create policy notifications_log_select_own on notifications_log
  for select to authenticated using (user_id = (select auth.uid()));
