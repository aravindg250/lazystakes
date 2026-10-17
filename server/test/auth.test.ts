/**
 * Sign-in and data isolation.
 *
 * The API side: only a token Supabase signed, for a real (non-anonymous)
 * user, unexpired, gets in, and the first one creates the account.
 * The database side: the app's public key and signed-in sessions can read
 * only their own rows, and can't write anything.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair } from "jose";

import { consentFor, createHarness, signToken, type Harness } from "./helpers";
import { materializeCheckIns } from "../src/jobs/materializeCheckIns";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
  h.deps.devAuth = false;
});

async function newAuthUser() {
  const { rows: [a] } = await h.db.query<{ id: string }>(`insert into auth.users (id) values (gen_random_uuid()) returning id`);
  return a!.id;
}

const bearer = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });

describe("signing in", () => {
  it("creates the account on the first request, with the device's timezone", async () => {
    const id = await newAuthUser();
    const token = await signToken(id);

    const me = await h.request("/v1/me", bearer(token, { "x-timezone": "Europe/London" }));
    expect(me.status).toBe(200);
    expect(me.body.timezone).toBe("Europe/London");
    expect(me.body.paymentMethod).toBeNull();

    // Later requests don't overwrite it; travel never moves anything.
    const again = await h.request("/v1/me", bearer(token, { "x-timezone": "Asia/Tokyo" }));
    expect(again.body.timezone).toBe("Europe/London");
    const { rows } = await h.db.query(`select 1 from users where id = $1`, [id]);
    expect(rows).toHaveLength(1);
  });

  it("falls back to UTC for a missing or bogus timezone", async () => {
    const id = await newAuthUser();
    const me = await h.request("/v1/me", bearer(await signToken(id), { "x-timezone": "Mars/Olympus" }));
    expect(me.body.timezone).toBe("UTC");
  });

  it("lets a signed-in user create a commitment end to end", async () => {
    const id = await newAuthUser();
    const headers = { ...bearer(await signToken(id), { "x-timezone": "America/New_York" }), "content-type": "application/json" };
    const res = await h.request("/v1/commitments", headers, {
      method: "POST",
      body: JSON.stringify({ title: "Read", scheduleDays: [1, 2, 3, 4, 5, 6, 7], stakeCents: 500, consentText: consentFor("Read", 500) }),
    });
    expect(res.status).toBe(201);
    const list = await h.request("/v1/commitments", headers);
    expect(list.body.map((c: { commitment: { title: string } }) => c.commitment.title)).toEqual(["Read"]);
  });

  it("rejects tokens that aren't a valid, current, real-user session", async () => {
    const id = await newAuthUser();
    const otherKey = await generateKeyPair("ES256");
    const bad = {
      expired: await signToken(id, { exp: Math.floor(Date.now() / 1000) - 120 }),
      wrongIssuer: await signToken(id, { iss: "https://someone-else.supabase.co/auth/v1" }),
      wrongAudience: await signToken(id, { aud: "anon" }),
      anonKeyRole: await signToken(id, { role: "anon" }),
      forged: await signToken(id, { key: otherKey.privateKey }),
      garbage: "not-a-token",
    };
    for (const [name, token] of Object.entries(bad)) {
      const res = await h.request("/v1/me", bearer(token));
      expect(res.status, name).toBe(401);
      expect(res.body.error.code, name).toBe("unauthenticated");
    }

    const anon = await h.request("/v1/me", bearer(await signToken(id, { anonymous: true })));
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("anonymous_not_allowed");

    const { rows } = await h.db.query(`select 1 from users where id = $1`, [id]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a still-valid token for a deleted account without crashing", async () => {
    const res = await h.request("/v1/me", bearer(await signToken(crypto.randomUUID())));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("This account no longer exists");
  });

  it("ignores the dev header unless DEV_AUTH is on", async () => {
    const user = await h.createUser();
    expect((await h.request("/v1/me", {})).status).toBe(401);
    expect((await h.request("/v1/me", { "x-dev-user-id": user })).status).toBe(401);
    h.deps.devAuth = true;
    expect((await h.request("/v1/me", { "x-dev-user-id": user })).status).toBe(200);
  });

  it("stays closed when the server has no Supabase URL", async () => {
    const id = await newAuthUser();
    h.deps.auth = null;
    const res = await h.request("/v1/me", bearer(await signToken(id)));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("auth_not_configured");
  });

  it("never shows or changes another user's commitment", async () => {
    const alice = await newAuthUser();
    const bob = await newAuthUser();
    const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });
    const aliceToken = await signToken(alice);
    const bobToken = await signToken(bob);

    const created = await h.request("/v1/commitments", json(aliceToken), {
      method: "POST",
      body: JSON.stringify({ title: "Gym", scheduleDays: [1, 3, 5], stakeCents: 500, consentText: consentFor("Gym", 500) }),
    });
    const cid = created.body.id as string;

    expect((await h.request(`/v1/commitments/${cid}`, json(bobToken))).status).toBe(404);
    expect((await h.request(`/v1/commitments/${cid}/pause`, json(bobToken), { method: "POST" })).status).toBe(404);
    expect((await h.request(`/v1/commitments/${cid}`, json(bobToken), { method: "DELETE" })).status).toBe(404);
    expect((await h.request("/v1/commitments", json(bobToken))).body).toEqual([]);
    expect((await h.request(`/v1/commitments/${cid}`, json(aliceToken))).body.commitment.status).toBe("active");
  });
});

describe("row-level security", () => {
  /** Runs SQL the way Supabase's REST endpoint would for this role and user. */
  async function as(role: "anon" | "authenticated", sub: string | null, sql: string) {
    return h.db.pg.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
      return (await tx.query<Record<string, unknown>>(sql)).rows;
    });
  }

  const tables = [
    "users", "payment_methods", "commitments", "check_ins", "evidence",
    "charges", "free_pass_usage", "consent_records", "notifications_log",
  ];

  let alice: string;
  let bob: string;

  beforeEach(async () => {
    h.deps.devAuth = true;
    alice = await h.createUser();
    bob = await h.createUser();
    for (const u of [alice, bob]) {
      const res = await h.api(u, "POST", "/v1/commitments", {
        title: "Gym", scheduleDays: [1, 2, 3, 4, 5, 6, 7], stakeCents: 500, consentText: consentFor("Gym", 500),
      });
      expect(res.status).toBe(201);
    }
    await materializeCheckIns(h.deps);
  });

  it("has RLS on every table", async () => {
    const { rows } = await h.db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual([...tables].sort());
    expect(rows.every((r) => r.rowsecurity)).toBe(true);
  });

  it("gives the public key nothing", async () => {
    for (const t of tables) {
      await expect(as("anon", null, `select * from ${t}`), t).rejects.toThrow(/permission denied/);
    }
  });

  it("lets a signed-in user read only their own rows", async () => {
    for (const t of ["commitments", "check_ins", "consent_records", "payment_methods"]) {
      const rows = await as("authenticated", alice, `select user_id from ${t}`);
      expect(rows.length, t).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === alice), t).toBe(true);
    }
    const me = await as("authenticated", alice, `select id from users`);
    expect(me).toEqual([{ id: alice }]);
    expect(await as("authenticated", null, `select * from commitments`)).toEqual([]);
  });

  it("lets a signed-in user write nothing, not even their own rows", async () => {
    const writes = [
      `insert into commitments (user_id, title, schedule_days, stake_cents, timezone, starts_on)
         values ('${alice}', 'x', '{1}', 100, 'UTC', current_date)`,
      `update commitments set stake_cents = 100 where user_id = '${alice}'`,
      `update check_ins set status = 'verified' where user_id = '${alice}'`,
      `delete from charges where user_id = '${alice}'`,
      `update users set stripe_customer_id = null where id = '${alice}'`,
      `insert into evidence (check_in_id, user_id, kind) select id, user_id, 'self_report' from check_ins limit 1`,
      `select * from free_pass_usage`,
    ];
    for (const sql of writes) {
      await expect(as("authenticated", alice, sql), sql).rejects.toThrow(/permission denied/);
    }
    const { rows } = await h.db.query(`select 1 from check_ins where status = 'verified'`);
    expect(rows).toHaveLength(0);
  });
});
