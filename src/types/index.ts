/**
 * These mirror the Postgres schema exactly. When the backend goes in,
 * this file becomes the shared contract between app and server —
 * that's the main reason we're in TypeScript on both sides.
 */

/** ISO weekday: 1 = Monday ... 7 = Sunday. Matches Luxon and the DB. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CheckInStatus =
  | "pending"    // due today, no proof yet
  | "verified"   // proof received before the deadline
  | "missed"     // no proof, charged
  | "excused"    // no proof, free pass used
  | "upcoming";  // scheduled, not today

export type EvidenceKind = "healthkit_workout" | "qr_scan" | "geofence_dwell";

export type Venue = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

export type Commitment = {
  id: string;
  title: string;
  scheduleDays: Weekday[];
  stakeCents: number;
  venue: Venue | null;
  deadlineLocalTime: string;   // "23:59"
  freePassesPerMonth: number;
  status: "active" | "paused" | "archived";
  createdAt: string;
};

export type Evidence = {
  kind: EvidenceKind;
  receivedAt: string;
  durationSec?: number;
  activityType?: string;
};

export type CheckIn = {
  id: string;
  commitmentId: string;
  dueDate: string;             // "2026-08-05"
  deadlineAt: string;          // ISO timestamp
  status: CheckInStatus;
  stakeCents: number;
  evidence: Evidence | null;
};

// ---------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------
// Money lives in cents everywhere and is only formatted at the edge.
// Floats for currency cause rounding bugs that show up as a user
// being charged $4.99 instead of $5.00 — never worth it.

export function formatMoney(cents: number, showCents = true): string {
  const dollars = cents / 100;
  return showCents || cents % 100 !== 0
    ? `$${dollars.toFixed(2)}`
    : `$${dollars.toFixed(0)}`;
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

export const WEEKDAY_INITIALS: Record<Weekday, string> = {
  1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S", 7: "S",
};

export function formatSchedule(days: Weekday[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 0) return "No days set";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.every((d) => d <= 5)) return "Weekdays";
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

/** "6 hr 31 min" — deliberately not a ticking countdown. See note in Part 2. */
export function formatTimeRemaining(deadlineAt: string, now = new Date()): string {
  const ms = new Date(deadlineAt).getTime() - now.getTime();
  if (ms <= 0) return "past deadline";
  const totalMin = Math.floor(ms / 60000);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr === 0) return `${min} min`;
  if (min === 0) return `${hr} hr`;
  return `${hr} hr ${min} min`;
}
