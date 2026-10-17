/**
 * Test harness: real Postgres (PGlite, in-process) running db/schema.sql and
 * every migration on top of a small stand-in for Supabase's auth schema, a
 * controllable clock, real signed session tokens, and fake Stripe and push
 * gateways that record calls.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";

import type { Db, Queryable, Row } from "../src/db";
import type { Deps } from "../src/deps";
import type { ChargeRequest, ChargeResult } from "../src/gateways/stripe";
import type { PushMessage } from "../src/gateways/push";
import { createApp } from "../src/api/app";
import { createJwtVerifier } from "../src/gateways/auth";

const dbDir = new URL("../db/", import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, dbDir)), "utf8");
const migrations = readdirSync(fileURLToPath(new URL("migrations/", dbDir)))
  .filter((f) => f.endsWith(".sql")).sort()
  .map((f) => read(`migrations/${f}`));

// The parts of a Supabase project the migrations depend on.
const supabaseStub = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  -- Supabase's default: everything granted to the client roles.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

export async function createTestDb(): Promise<Db & { pg: PGlite }> {
  // Keep `date` as "YYYY-MM-DD", matching the node-postgres setup.
  const pg = await PGlite.create({ parsers: { 1082: (v: string) => v } });
  await pg.exec(supabaseStub);
  await pg.exec(read("schema.sql"));
  for (const m of migrations) await pg.exec(m);

  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    query: async <T extends Row>(text: string, params?: unknown[]) => {
      const r = await q.query<T>(text, params as unknown[] | undefined);
      return { rows: r.rows };
    },
  });

  return {
    pg,
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}

// One signing key for the whole run, standing in for the project's key.
export const ISSUER = "https://test-project.supabase.co/auth/v1";
const signingKey = await generateKeyPair("ES256");
const publicJwk = { ...(await exportJWK(signingKey.publicKey)), kid: "test", alg: "ES256" };

export async function signToken(
  sub: string,
  opts: { exp?: string | number; iss?: string; aud?: string; role?: string; anonymous?: boolean; key?: CryptoKey } = {},
) {
  return new SignJWT({ role: opts.role ?? "authenticated", is_anonymous: opts.anonymous ?? false })
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setSubject(sub)
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? signingKey.privateKey);
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
    auth: createJwtVerifier(createLocalJWKSet({ keys: [publicJwk] }), ISSUER),
    devAuth: true,
  };

  const app = createApp(deps);

  async function createUser(timezone = "America/New_York", opts: { card?: boolean; token?: string } = {}) {
    const { rows: [u] } = await db.query<{ id: string }>(
      `with a as (insert into auth.users (id) values (gen_random_uuid()) returning id)
       insert into users (id, timezone, stripe_customer_id, expo_push_token)
       select a.id, $1, $2, $3 from a returning id`,
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

  /** A request with raw headers, for exercising auth itself. */
  async function request<T = any>(path: string, headers: Record<string, string>, init: RequestInit = {}) {
    const res = await app.request(path, { ...init, headers });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  return {
    db, deps, app, api, request, createUser, chargeCalls, pushes,
    setNow: (iso: string) => { now = new Date(iso); },
    respondToCharges: (fn: (req: ChargeRequest) => ChargeResult) => { chargeResponder = fn; },
  };
}

/** The consent wording the confirm screen produces, for valid create calls. */
export function consentFor(title: string, stakeCents: number) {
  return `I authorise LazyStakes to charge $${(stakeCents / 100).toFixed(2)} to my Visa 4242 each day that I don't mark "${title}" done by 11:59 pm.`;
}
