/**
 * scheduler.ts — the cron table.
 *
 * Every job is idempotent, so a missed run is caught up by the next one and
 * a double run changes nothing. Times are UTC; per-user local times are
 * handled inside the jobs, never by the cron expressions.
 */

import { schedule } from "node-cron";

import type { Deps } from "./deps";
import { materializeCheckIns } from "./jobs/materializeCheckIns";
import { resolveDeadlines } from "./jobs/resolveDeadlines";
import { processCharges } from "./jobs/processCharges";
import { sendNotifications } from "./jobs/sendNotifications";

export const JOBS = {
  materialize: materializeCheckIns,
  resolve: resolveDeadlines,
  charge: processCharges,
  notify: sendNotifications,
} as const;

export type JobName = keyof typeof JOBS;

export async function runJob(name: JobName, deps: Deps): Promise<unknown> {
  const started = Date.now();
  try {
    const result = await JOBS[name](deps);
    console.log(`[job:${name}] ok in ${Date.now() - started}ms`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`[job:${name}] failed after ${Date.now() - started}ms`, err);
    throw err;
  }
}

export function startScheduler(deps: Deps) {
  const opts = { timezone: "UTC", noOverlap: true };
  const run = (name: JobName) => () => runJob(name, deps).then(() => {}, () => {});

  // Nightly, two days ahead. Creating or resuming a commitment also
  // materializes immediately, so nothing waits for this run.
  schedule("0 2 * * *", run("materialize"), { ...opts, name: "materialize" });

  // Deadlines first, then charges, then notifications, a minute apart so a
  // freshly missed day is charged in the same quarter hour.
  schedule("*/15 * * * *", run("resolve"), { ...opts, name: "resolve" });
  schedule("1-59/15 * * * *", run("charge"), { ...opts, name: "charge" });
  schedule("2-59/15 * * * *", run("notify"), { ...opts, name: "notify" });

  console.log("[scheduler] started: materialize 02:00 UTC; resolve/charge/notify every 15 min");
}
