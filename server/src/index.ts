/**
 * index.ts — the Railway service: HTTP API plus the cron jobs, one process.
 */

import { serve } from "@hono/node-server";

import { createApp } from "./api/app";
import { createRuntime } from "./runtime";
import { startScheduler } from "./scheduler";

const { config, deps } = createRuntime();

if (config.devAuth && process.env.RAILWAY_ENVIRONMENT_NAME === "production") {
  throw new Error("DEV_AUTH is on in production. Refusing to start.");
}

serve({ fetch: createApp(deps).fetch, port: config.port }, (info) => {
  console.log(`[api] listening on :${info.port}${config.devAuth ? " (DEV_AUTH on)" : ""}`);
});

if (config.jobsEnabled) startScheduler(deps);
