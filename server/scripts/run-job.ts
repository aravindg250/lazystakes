/**
 * run-job.ts — run one job now, outside the schedule.
 *
 *   npm run job -- materialize | resolve | charge | notify
 */

import { createRuntime } from "../src/runtime";
import { JOBS, runJob, type JobName } from "../src/scheduler";

const name = process.argv[2] as JobName;
if (!(name in JOBS)) {
  console.error(`Usage: npm run job -- ${Object.keys(JOBS).join(" | ")}`);
  process.exit(1);
}

const { deps } = createRuntime();
try {
  await runJob(name, deps);
} finally {
  await deps.db.close();
}
