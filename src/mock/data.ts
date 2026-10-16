/**
 * Mock data for building the UI with no backend.
 *
 * The history is deliberately messy — charged misses, a used free pass,
 * days marked done at odd hours, and a stake that was lower two months ago. Those are the cases that break layouts and expose bad
 * assumptions, and finding them now is far cheaper than finding them later.
 */

import type { Commitment, CheckIn, Weekday, CheckInStatus } from "../types";

const iso = (daysFromNow: number, hour = 23, minute = 59) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const dateStr = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

export const mockCommitments: Commitment[] = [
  {
    id: "c1",
    title: "Go to the gym",
    scheduleDays: [1, 3, 5] as Weekday[],
    stakeCents: 500,
    deadlineLocalTime: "23:59",
    freePassesPerMonth: 1,
    status: "active",
    createdAt: iso(-70),
  },
  {
    id: "c2",
    title: "Grocery run",
    scheduleDays: [2, 6] as Weekday[],
    stakeCents: 1000,
    deadlineLocalTime: "23:59",
    freePassesPerMonth: 1,
    status: "active",
    createdAt: iso(-12),
  },
  {
    id: "c3",
    title: "Stretch before bed",
    scheduleDays: [1, 2, 3, 4, 5] as Weekday[],
    stakeCents: 200,
    deadlineLocalTime: "23:59",
    freePassesPerMonth: 2,
    status: "paused",
    createdAt: iso(-30),
  },
];

// ---------------------------------------------------------------
// Generated history
// ---------------------------------------------------------------
// Roughly nine weeks of gym days with a believable failure rate. Days are
// marked done at varied times, including a couple close to the deadline.

const MARKED_AT: [number, number][] = [[7, 12], [18, 42], [19, 5], [23, 48], [12, 30], [21, 15]];

function buildGymHistory(): CheckIn[] {
  const out: CheckIn[] = [];
  const pattern: CheckInStatus[] = [
    "verified", "missed", "verified", "verified", "excused",
    "verified", "verified", "verified", "missed", "verified",
    "verified", "verified", "verified", "verified", "verified",
    "verified", "missed", "verified", "verified", "verified",
    "verified", "verified", "verified", "verified",
  ];

  pattern.forEach((status, i) => {
    const offset = -2 - i * 2;
    const older = i > 14; // stake was lower before the last bump
    out.push({
      id: `gym-${i}`,
      commitmentId: "c1",
      dueDate: dateStr(offset),
      deadlineAt: iso(offset),
      status,
      stakeCents: older ? 300 : 500,
      evidence:
        status === "verified"
          ? { kind: "self_report", receivedAt: iso(offset, MARKED_AT[i % MARKED_AT.length][0], MARKED_AT[i % MARKED_AT.length][1]) }
          : null,
    });
  });

  return out;
}

export const mockCheckIns: CheckIn[] = [
  {
    id: "ci-today",
    commitmentId: "c1",
    dueDate: dateStr(0),
    deadlineAt: iso(0),
    status: "pending",
    stakeCents: 500,
    evidence: null,
  },
  {
    id: "ci-upcoming",
    commitmentId: "c2",
    dueDate: dateStr(1),
    deadlineAt: iso(1),
    status: "upcoming",
    stakeCents: 1000,
    evidence: null,
  },
  ...buildGymHistory(),
];

export const mockMonthSummary = {
  completed: 11,
  scheduled: 12,
  chargedCents: 500,
  passesUsed: 1,
  passesTotal: 1,
};

// ---------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------

export function historyFor(commitmentId: string): CheckIn[] {
  return mockCheckIns
    .filter((ci) => ci.commitmentId === commitmentId && ci.status !== "upcoming")
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
}

export type CommitmentStats = {
  kept: number;
  missed: number;
  excused: number;
  total: number;
  paidCents: number;
  rate: number; // 0..1
};

export function statsFor(commitmentId: string): CommitmentStats {
  const history = historyFor(commitmentId).filter((ci) => ci.status !== "pending");

  const kept = history.filter((ci) => ci.status === "verified").length;
  const missed = history.filter((ci) => ci.status === "missed").length;
  const excused = history.filter((ci) => ci.status === "excused").length;
  const paidCents = history
    .filter((ci) => ci.status === "missed")
    .reduce((sum, ci) => sum + ci.stakeCents, 0);

  const total = history.length;
  return {
    kept, missed, excused, total, paidCents,
    rate: total === 0 ? 0 : kept / total,
  };
}

/** Groups check-ins by calendar month for the history list. */
export function groupByMonth(checkIns: CheckIn[]): { label: string; items: CheckIn[] }[] {
  const buckets = new Map<string, CheckIn[]>();

  for (const ci of checkIns) {
    const key = ci.dueDate.slice(0, 7); // "2026-08"
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(ci);
  }

  return [...buckets.entries()].map(([key, items]) => {
    const [y, m] = key.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long", year: "numeric",
    });
    return { label, items };
  });
}

/** Every charge across all commitments, newest first. Used by the payment screen. */
export function allCharges(): { checkIn: CheckIn; commitmentTitle: string }[] {
  return mockCheckIns
    .filter((ci) => ci.status === "missed")
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
    .map((ci) => ({
      checkIn: ci,
      commitmentTitle: mockCommitments.find((cm) => cm.id === ci.commitmentId)?.title ?? "Commitment",
    }));
}

export const mockPaymentMethod = {
  brand: "Visa",
  last4: "4242",
  expMonth: 11,
  expYear: 2028,
};

export const mockAccount = {
  name: "Aravind",
  email: "aravind@example.com",
  memberSince: "March 2026",
};
