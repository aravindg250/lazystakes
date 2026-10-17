/**
 * history.ts — grouping a commitment's past days for display.
 */

import type { CheckIn } from "../types";

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
