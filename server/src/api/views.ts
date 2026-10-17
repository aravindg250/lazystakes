/**
 * views.ts — database rows to the shapes the app already renders.
 *
 * The app's types in src/types are the contract; the API returns exactly
 * those, so Phase 3 swaps mock data for fetch calls without touching
 * screens. Future pending check-ins become "upcoming", which is how the app
 * distinguishes today from later this week.
 */

import type { CheckIn, CheckInStatus, Commitment, Weekday } from "../../../src/types";

export type CommitmentRow = {
  id: string;
  title: string;
  schedule_days: number[];
  stake_cents: number;
  deadline_local_time: string;
  free_passes_per_month: number;
  status: Commitment["status"];
  created_at: Date;
};

export type CheckInRow = {
  id: string;
  commitment_id: string;
  due_date: string;
  deadline_utc: Date;
  status: Exclude<CheckInStatus, "upcoming">;
  stake_cents: number;
  evidence_received_at: Date | null;
};

export const COMMITMENT_COLUMNS = `
  c.id, c.title, c.schedule_days, c.stake_cents,
  c.deadline_local_time::text as deadline_local_time,
  c.free_passes_per_month, c.status, c.created_at`;

/** Check-in columns plus its live self-report, if any. */
export const CHECK_IN_COLUMNS = `
  ci.id, ci.commitment_id, ci.due_date, ci.deadline_utc, ci.status, ci.stake_cents,
  (select e.server_received_at from evidence e
    where e.check_in_id = ci.id and e.withdrawn_at is null
    limit 1) as evidence_received_at`;

export function commitmentView(r: CommitmentRow): Commitment {
  return {
    id: r.id,
    title: r.title,
    scheduleDays: r.schedule_days as Weekday[],
    stakeCents: r.stake_cents,
    deadlineLocalTime: r.deadline_local_time.slice(0, 5),
    freePassesPerMonth: r.free_passes_per_month,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  };
}

export function checkInView(r: CheckInRow, today: string): CheckIn {
  const live = r.evidence_received_at;
  // A pending day with a live self-report shows as verified immediately;
  // the deadline job makes it official at 11:59 pm.
  const status: CheckInStatus =
    r.status !== "pending" ? r.status
    : live ? "verified"
    : r.due_date > today ? "upcoming"
    : "pending";

  return {
    id: r.id,
    commitmentId: r.commitment_id,
    dueDate: r.due_date,
    deadlineAt: r.deadline_utc.toISOString(),
    status,
    stakeCents: r.stake_cents,
    evidence: live ? { kind: "self_report", receivedAt: live.toISOString() } : null,
  };
}
