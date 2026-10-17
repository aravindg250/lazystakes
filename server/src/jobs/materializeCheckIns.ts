/**
 * materializeCheckIns — create pending check-ins ahead of time.
 *
 * Runs nightly (2 am UTC), and for a single commitment when it's created or
 * resumed. For each active commitment it creates a check-in for every
 * scheduled local date from today through DAYS_AHEAD days out, skipping:
 *
 *   - dates before `starts_on` (a new or resumed commitment never charges
 *     same-day — starts_on is always set to tomorrow)
 *   - dates whose deadline has already passed
 *
 * Idempotent: the unique (commitment_id, due_date) constraint plus
 * ON CONFLICT DO NOTHING means rerunning after a crash creates nothing new.
 */

import type { Queryable } from "../db";
import type { Deps } from "../deps";
import { deadlineUtc, localDate, scheduledDates } from "../time";

export const DAYS_AHEAD = 2;

export type CommitmentForSchedule = {
  id: string;
  user_id: string;
  schedule_days: number[];
  stake_cents: number;
  timezone: string;
  deadline_local_time: string;
  starts_on: string;
};

export async function materializeForCommitment(
  q: Queryable, c: CommitmentForSchedule, now: Date,
): Promise<number> {
  const today = localDate(c.timezone, now);
  const dates = scheduledDates(today, DAYS_AHEAD, c.schedule_days)
    .filter((d) => d >= c.starts_on)
    .map((d) => ({ d, deadline: deadlineUtc(d, c.deadline_local_time, c.timezone) }))
    .filter(({ deadline }) => deadline.getTime() > now.getTime());

  let created = 0;
  for (const { d, deadline } of dates) {
    const r = await q.query(
      `insert into check_ins (commitment_id, user_id, due_date, deadline_utc, stake_cents)
       values ($1, $2, $3, $4, $5)
       on conflict (commitment_id, due_date) do nothing
       returning id`,
      [c.id, c.user_id, d, deadline, c.stake_cents],
    );
    created += r.rows.length;
  }
  return created;
}

export async function materializeCheckIns(deps: Pick<Deps, "db" | "now">): Promise<{ created: number }> {
  const now = deps.now();
  const { rows } = await deps.db.query<CommitmentForSchedule>(
    `select id, user_id, schedule_days, stake_cents, timezone,
            deadline_local_time::text as deadline_local_time, starts_on
       from commitments
      where status = 'active'`,
  );

  let created = 0;
  for (const c of rows) {
    created += await materializeForCommitment(deps.db, c, now);
  }
  return { created };
}
