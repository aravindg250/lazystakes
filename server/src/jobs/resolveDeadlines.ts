/**
 * resolveDeadlines — decide every check-in whose deadline has passed.
 *
 * Runs every 15 minutes. Each pending check-in past its deadline resolves
 * exactly once, to one of:
 *
 *   verified  a live (not withdrawn) self-report received by the deadline
 *   excused   no evidence, and a free pass left this month — used automatically
 *   missed    no evidence, no pass — and a charge row is inserted in the
 *             same transaction, so a crash can never leave a miss without a
 *             charge or a charge without a miss
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so two workers running at
 * once split the work instead of resolving the same check-in twice. The
 * check_ins terminal-state trigger is the backstop if anything else tries.
 */

import type { Queryable } from "../db";
import type { Deps } from "../deps";
import { monthOf } from "../time";

const BATCH = 100;

type Claimed = {
  id: string;
  commitment_id: string;
  user_id: string;
  due_date: string;
  deadline_utc: Date;
  stake_cents: number;
};

export type Resolution = "verified" | "excused" | "missed";

export async function resolveDeadlines(
  deps: Pick<Deps, "db" | "now">,
): Promise<Record<Resolution, number>> {
  const counts: Record<Resolution, number> = { verified: 0, excused: 0, missed: 0 };
  const now = deps.now();

  for (;;) {
    const resolved = await deps.db.tx(async (q) => {
      const { rows } = await q.query<Claimed>(
        `select id, commitment_id, user_id, due_date, deadline_utc, stake_cents
           from check_ins
          where status = 'pending' and deadline_utc <= $1
          order by deadline_utc
          limit ${BATCH}
          for update skip locked`,
        [now],
      );
      for (const ci of rows) counts[await resolveOne(q, ci, now)]++;
      return rows.length;
    });
    if (resolved < BATCH) break;
  }

  return counts;
}

async function resolveOne(q: Queryable, ci: Claimed, now: Date): Promise<Resolution> {
  const evidence = await q.query(
    `select 1 from evidence
      where check_in_id = $1
        and withdrawn_at is null
        and server_received_at <= $2
      limit 1`,
    [ci.id, ci.deadline_utc],
  );

  if (evidence.rows.length > 0) {
    await setStatus(q, ci.id, "verified", now);
    return "verified";
  }

  // Lock the commitment so two check-ins of the same commitment resolving
  // at once can't both take the month's last free pass.
  const month = monthOf(ci.due_date);
  const { rows: [pass] } = await q.query<{ allowance: number; used: number }>(
    `select c.free_passes_per_month as allowance,
            (select count(*)::int from free_pass_usage f
              where f.commitment_id = c.id and f.month = $2) as used
       from commitments c
      where c.id = $1
      for update of c`,
    [ci.commitment_id, month],
  );

  if (pass && pass.used < pass.allowance) {
    await q.query(
      `insert into free_pass_usage (commitment_id, check_in_id, month) values ($1, $2, $3)`,
      [ci.commitment_id, ci.id, month],
    );
    await setStatus(q, ci.id, "excused", now);
    return "excused";
  }

  await setStatus(q, ci.id, "missed", now);
  await q.query(
    `insert into charges (check_in_id, user_id, amount_cents, idempotency_key, next_attempt_at)
     values ($1, $2, $3, $4, $5)`,
    [ci.id, ci.user_id, ci.stake_cents, `checkin_${ci.id}`, now],
  );
  return "missed";
}

async function setStatus(q: Queryable, id: string, status: Resolution, now: Date) {
  await q.query(
    `update check_ins set status = $2, resolved_at = $3 where id = $1`,
    [id, status, now],
  );
}
