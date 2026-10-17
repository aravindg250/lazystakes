/**
 * config.ts — environment, validated once at startup.
 *
 * A missing DATABASE_URL should fail loudly at boot, not as a confusing
 * error at 11:59 pm when the deadline job first touches the database.
 */

import { existsSync } from "node:fs";
import { z } from "zod";

// Local runs read server/.env; Railway injects variables directly.
if (existsSync(".env")) process.loadEnvFile(".env");

const bool = (fallback: boolean) =>
  z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? fallback : v === "true"));

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  STRIPE_SECRET_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  JOBS_ENABLED: bool(true),
  NOTIFICATIONS_ENABLED: bool(false),
  DEV_AUTH: bool(false),
});

export type Config = {
  databaseUrl: string;
  stripeSecretKey: string | undefined;
  port: number;
  jobsEnabled: boolean;
  notificationsEnabled: boolean;
  devAuth: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    stripeSecretKey: e.STRIPE_SECRET_KEY || undefined,
    port: e.PORT,
    jobsEnabled: e.JOBS_ENABLED,
    notificationsEnabled: e.NOTIFICATIONS_ENABLED,
    devAuth: e.DEV_AUTH,
  };
}

/** Charges retry this many times in total before the user is blocked. */
export const MAX_CHARGE_ATTEMPTS = 3;

/** Wait before attempt 2 and attempt 3. */
export const CHARGE_RETRY_DELAYS_MS = [60 * 60_000, 6 * 60 * 60_000];
