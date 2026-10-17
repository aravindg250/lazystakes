/**
 * sendNotifications — the 6 pm reminder, the 10 pm final warning, and
 * charge receipts.
 *
 * Runs every 15 minutes. Does nothing unless NOTIFICATIONS_ENABLED is on,
 * which waits until the app registers push tokens.
 *
 * Why this is built carefully: "I was never told" is the most common
 * opening line of a chargeback, and notifications_log is the answer. A row
 * is written as `sending` before the push goes out — its unique key stops a
 * second worker sending the same warning — and flipped to `sent` only when
 * Expo accepts it. A row that says `sent` is therefore never a lie.
 *
 * Reminders go out only while the day is still unverified, and a late run
 * skips the 6 pm reminder once the 10 pm warning is due, rather than
 * sending both at once. Copy is factual: what's due, when, and how much.
 */

import type { Deps } from "../deps";
import { localTimeToUtc } from "../time";
import { formatMoney } from "../../../src/types";

const REMINDER_LOCAL = "18:00";
const FINAL_WARNING_LOCAL = "22:00";

type Due = {
  check_in_id: string;
  user_id: string;
  due_date: string;
  deadline_utc: Date;
  stake_cents: number;
  title: string;
  timezone: string;
  token: string;
  remind_enabled: boolean;
  final_warning_enabled: boolean;
};

export async function sendNotifications(
  deps: Pick<Deps, "db" | "now" | "push" | "notificationsEnabled">,
): Promise<{ reminders: number; warnings: number; receipts: number; skipped?: true }> {
  const out = { reminders: 0, warnings: 0, receipts: 0 };
  if (!deps.notificationsEnabled) return { ...out, skipped: true };
  const now = deps.now();

  // Pending, unverified check-ins whose deadline is still ahead today.
  const { rows: due } = await deps.db.query<Due>(
    `select ci.id as check_in_id, ci.user_id, ci.due_date, ci.deadline_utc, ci.stake_cents,
            c.title, c.timezone, u.expo_push_token as token,
            u.remind_enabled, u.final_warning_enabled
       from check_ins ci
       join commitments c on c.id = ci.commitment_id
       join users u on u.id = ci.user_id
      where ci.status = 'pending'
        and ci.deadline_utc > $1
        and ci.deadline_utc <= $1::timestamptz + interval '26 hours'
        and u.expo_push_token is not null
        and not exists (select 1 from evidence e
                         where e.check_in_id = ci.id and e.withdrawn_at is null)`,
    [now],
  );

  for (const d of due) {
    const reminderAt = localTimeToUtc(d.due_date, REMINDER_LOCAL, d.timezone);
    const warningAt = localTimeToUtc(d.due_date, FINAL_WARNING_LOCAL, d.timezone);
    const stake = formatMoney(d.stake_cents, false);

    if (now >= warningAt) {
      if (d.final_warning_enabled && await send(deps, d.user_id, { checkInId: d.check_in_id }, "final_warning", {
        to: d.token,
        title: `Due by 11:59 pm: ${d.title}`,
        body: `${stake} is charged at 11:59 pm unless you mark it done.`,
        data: { checkInId: d.check_in_id },
      })) out.warnings++;
    } else if (now >= reminderAt) {
      if (d.remind_enabled && await send(deps, d.user_id, { checkInId: d.check_in_id }, "reminder", {
        to: d.token,
        title: d.title,
        body: `Due by 11:59 pm · ${stake} at stake. Hold Mark done when it's done.`,
        data: { checkInId: d.check_in_id },
      })) out.reminders++;
    }
  }

  // Receipts for charges that succeeded in the last day.
  const { rows: receipts } = await deps.db.query<{
    charge_id: string; user_id: string; amount_cents: number; title: string; due_date: string; token: string;
  }>(
    `select ch.id as charge_id, ch.user_id, ch.amount_cents, c.title, ci.due_date,
            u.expo_push_token as token
       from charges ch
       join check_ins ci on ci.id = ch.check_in_id
       join commitments c on c.id = ci.commitment_id
       join users u on u.id = ch.user_id
      where ch.status = 'succeeded'
        and ch.succeeded_at > $1::timestamptz - interval '1 day'
        and u.receipts_enabled
        and u.expo_push_token is not null`,
    [now],
  );

  for (const r of receipts) {
    if (await send(deps, r.user_id, { chargeId: r.charge_id }, "charge_receipt", {
      to: r.token,
      title: `Charged ${formatMoney(r.amount_cents)}`,
      body: `${r.title} · ${r.due_date}`,
      data: { chargeId: r.charge_id },
    })) out.receipts++;
  }

  return out;
}

/** Log-then-send-then-confirm. Returns false if already sent or claimed. */
async function send(
  deps: Pick<Deps, "db" | "now" | "push">,
  userId: string,
  ref: { checkInId?: string; chargeId?: string },
  kind: "reminder" | "final_warning" | "charge_receipt",
  msg: Parameters<Deps["push"]["send"]>[0],
): Promise<boolean> {
  const conflictTarget = ref.checkInId
    ? "(check_in_id, kind) where check_in_id is not null"
    : "(charge_id, kind) where charge_id is not null";

  const { rows: [log] } = await deps.db.query<{ id: string }>(
    `insert into notifications_log (user_id, check_in_id, charge_id, kind)
     values ($1, $2, $3, $4)
     on conflict ${conflictTarget} do nothing
     returning id`,
    [userId, ref.checkInId ?? null, ref.chargeId ?? null, kind],
  );
  if (!log) return false;

  const result = await deps.push.send(msg);
  await deps.db.query(
    `update notifications_log
        set status = $2, push_ticket_id = $3, error = $4, sent_at = $5
      where id = $1`,
    result.ok
      ? [log.id, "sent", result.ticketId, null, deps.now()]
      : [log.id, "failed", null, result.error, null],
  );
  return result.ok;
}
