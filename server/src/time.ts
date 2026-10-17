/**
 * time.ts — every timezone calculation in the system.
 *
 * Rule from the spec: the server owns all time. Deadlines come from the
 * commitment's stored IANA timezone, never the device's, and are computed
 * here and nowhere else. Luxon handles daylight saving: 11:59 pm in New
 * York is 03:59 UTC in summer and 04:59 UTC in winter, and both fall out of
 * the same call.
 */

import { DateTime } from "luxon";
import type { Weekday } from "../../src/types";

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

/** The calendar date it is right now in `tz`, as "YYYY-MM-DD". */
export function localDate(tz: string, now: Date): string {
  return DateTime.fromJSDate(now, { zone: tz }).toISODate()!;
}

/** `date` plus `days`, as "YYYY-MM-DD". Pure calendar arithmetic, no zone. */
export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;
}

/** ISO weekday of a calendar date, 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): Weekday {
  return DateTime.fromISO(date, { zone: "utc" }).weekday as Weekday;
}

/** A local wall-clock time on a local date, as a UTC instant. */
export function localTimeToUtc(date: string, time: string, tz: string): Date {
  const hhmm = time.slice(0, 5); // Postgres `time` comes back as "23:59:00"
  const dt = DateTime.fromISO(`${date}T${hhmm}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid local time ${date} ${time} in ${tz}`);
  return dt.toJSDate();
}

/**
 * The deadline instant: the end of the deadline minute, so "11:59 pm"
 * includes the whole 11:59 minute (a mark at 23:59:40 counts).
 */
export function deadlineUtc(dueDate: string, deadlineLocalTime: string, tz: string): Date {
  return new Date(localTimeToUtc(dueDate, deadlineLocalTime, tz).getTime() + 59_999);
}

/** Midnight at the start of the local due date — when marking done opens. */
export function dayStartUtc(dueDate: string, tz: string): Date {
  return DateTime.fromISO(dueDate, { zone: tz }).startOf("day").toJSDate();
}

/** First day of the month a date falls in, as "YYYY-MM-01". */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Local dates from `from` through `from + daysAhead` that fall on one of
 * the scheduled weekdays.
 */
export function scheduledDates(from: string, daysAhead: number, scheduleDays: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = addDays(from, i);
    if (scheduleDays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}
