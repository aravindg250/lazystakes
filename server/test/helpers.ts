/**
 * Test harness: real Postgres (PGlite, in-process) running db/schema.sql,
 * a controllable clock, and fake Stripe and push gateways that record calls.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

import type { Db, Queryable, Row } from "../src/db";
import type { Deps } from "../src/deps";
import type { ChargeRequest, ChargeResult } from "../src/gateways/stripe";
import type { PushMessage } from "../src/gateways/push";
import { createApp } from "../src/api/app";

const schema = readFileSync(fileURLToPath(new URL("../db/schema.sql", import.meta.url)), "utf8");

export async function createTestDb(): Promise<Db> {
  // Keep `date` as "YYYY-MM-DD", matching the node-postgres setup.
  const pg = await PGlite.create({ parsers: { 1082: (v: string) => v } });
  await pg.exec(schema);

  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    query: async <T extends Row>(text: string, params?: unknown[]) => {
      const r = await q.query<T>(text, params as unknown[] | undefined);
      return { rows: r.rows };
    },
  });

  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export async function createHarness() {
  const db = await createTestDb();
  let now = new Date("2026-10-15T14:00:00Z");

  const chargeCalls: ChargeRequest[] = [];
  let chargeResponder: (req: ChargeRequest) => ChargeResult = (req) => ({
    ok: true, paymentIntentId: req.existingPaymentIntentId ?? `pi_${req.checkInId.slice(0, 8)}`,
  });

  const pushes: PushMessage[] = [];

  const deps: Deps = {
    db,
    now: () => now,
    charges: { charge: async (req) => { chargeCalls.push(req); return chargeResponder(req); } },
    push: { send: async (msg) => { pushes.push(msg); return { ok: true, ticketId: `t${pushes.length}` }; } },
    notificationsEnabled: true,
    devAuth: true,
  };

  const app = createApp(deps);

  async function createUser(timezone = "America/New_York", opts: { card?: boolean; token?: string } = {}) {
    const { rows: [u] } = await db.query<{ id: string }>(
      `insert into users (timezone, stripe_customer_id, expo_push_token)
       values ($1, $2, $3) returning id`,
      [timezone, opts.card === false ? null : `cus_${Math.random().toString(36).slice(2)}`, opts.token ?? null],
    );
    if (opts.card !== false) {
      await db.query(
        `insert into payment_methods (user_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
         values ($1, $2, 'Visa', '4242', 12, 2030, true)`,
        [u!.id, `pm_${Math.random().toString(36).slice(2)}`],
      );
    }
    return u!.id;
  }

  async function api<T = any>(userId: string, method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
      method,
      headers: { "x-dev-user-id": userId, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  return {
    db, deps, app, api, createUser, chargeCalls, pushes,
    setNow: (iso: string) => { now = new Date(iso); },
    respondToCharges: (fn: (req: ChargeRequest) => ChargeResult) => { chargeResponder = fn; },
  };
}

/** The consent wording the confirm screen produces, for valid create calls. */
export function consentFor(title: string, stakeCents: number) {
  return `I authorise LazyStakes to charge $${(stakeCents / 100).toFixed(2)} to my Visa 4242 each day that I don't mark "${title}" done by 11:59 pm.`;
}
