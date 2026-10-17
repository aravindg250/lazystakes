/**
 * End-to-end behaviour of the money loop against real Postgres:
 * scheduling, marking done, undo, free passes, misses, charges, retries,
 * the billing block, pausing, and notifications.
 *
 * Calendar used throughout (America/New_York, EDT = UTC-4 in October):
 *   Thu 2026-10-15  commitment created at 10:00 local (14:00Z)
 *   Fri 2026-10-16  first scheduled day
 *   Sat 2026-10-17  second scheduled day
 */

import { beforeEach, describe, expect, it } from "vitest";

import { consentFor, createHarness, type Harness } from "./helpers";
import { materializeCheckIns } from "../src/jobs/materializeCheckIns";
import { resolveDeadlines } from "../src/jobs/resolveDeadlines";
import { processCharges, requeueFailedCharges } from "../src/jobs/processCharges";
import { sendNotifications } from "../src/jobs/sendNotifications";

let h: Harness;
let user: string;

beforeEach(async () => {
  h = await createHarness();
  user = await h.createUser();
});

async function createGymCommitment(scheduleDays = [4, 5, 6], stakeCents = 500, title = "Go to the gym") {
  const res = await h.api(user, "POST", "/v1/commitments", {
    title, scheduleDays, stakeCents, consentText: consentFor(title, stakeCents),
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function checkIns(commitmentId: string) {
  const { rows } = await h.db.query<{ id: string; due_date: string; status: string; deadline_utc: Date }>(
    `select id, due_date, status, deadline_utc from check_ins where commitment_id = $1 order by due_date`,
    [commitmentId],
  );
  return rows;
}

const run = {
  materialize: () => materializeCheckIns(h.deps),
  resolve: () => resolveDeadlines(h.deps),
  charge: () => processCharges(h.deps),
  notify: () => sendNotifications(h.deps),
};

describe("scheduling", () => {
  it("never schedules the creation day, and materializing is idempotent", async () => {
    const id = await createGymCommitment(); // Thu/Fri/Sat, created Thursday
    const rows = await checkIns(id);
    expect(rows.map((r) => r.due_date)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(rows[0]!.deadline_utc.toISOString()).toBe("2026-10-17T03:59:59.999Z");

    expect(await run.materialize()).toEqual({ created: 0 });
  });

  it("records the exact consent language", async () => {
    const id = await createGymCommitment();
    const { rows } = await h.db.query<{ consent_text: string }>(
      `select consent_text from consent_records where commitment_id = $1`, [id],
    );
    expect(rows[0]!.consent_text).toBe(consentFor("Go to the gym", 500));
  });

  it("rejects consent text that doesn't name the stake, and stakes over $20", async () => {
    const bad = await h.api(user, "POST", "/v1/commitments", {
      title: "Go to the gym", scheduleDays: [1], stakeCents: 500, consentText: consentFor("Go to the gym", 1000),
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("consent_mismatch");

    const tooHigh = await h.api(user, "POST", "/v1/commitments", {
      title: "Go to the gym", scheduleDays: [1], stakeCents: 2100, consentText: consentFor("Go to the gym", 2100),
    });
    expect(tooHigh.status).toBe(400);
  });
});

describe("marking done", () => {
  it("can't mark a day before it starts", async () => {
    const id = await createGymCommitment();
    const [fri] = await checkIns(id);
    const res = await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_due_yet");
  });

  it("mark, undo, mark again — the last state before the deadline wins", async () => {
    const id = await createGymCommitment();
    const [fri] = await checkIns(id);
    h.setNow("2026-10-16T22:00:00Z"); // Fri 18:00 local

    const marked = await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);
    expect(marked.status).toBe(200);
    expect(marked.body.status).toBe("verified");
    expect(marked.body.evidence.receivedAt).toBe("2026-10-16T22:00:00.000Z");

    // Double tap: still exactly one live self-report.
    await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);
    const live = await h.db.query(`select 1 from evidence where check_in_id = $1 and withdrawn_at is null`, [fri!.id]);
    expect(live.rows).toHaveLength(1);

    const undone = await h.api(user, "POST", `/v1/check-ins/${fri!.id}/undo`);
    expect(undone.body.status).toBe("pending");

    h.setNow("2026-10-17T03:59:30Z"); // Fri 23:59:30 local — still counts
    await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);

    h.setNow("2026-10-17T04:15:00Z");
    expect(await run.resolve()).toEqual({ verified: 1, excused: 0, missed: 0 });

    // Withdrawn evidence is kept for the record, not deleted.
    const all = await h.db.query(`select 1 from evidence where check_in_id = $1`, [fri!.id]);
    expect(all.rows).toHaveLength(2);
  });

  it("rejects marks and undos after the deadline", async () => {
    const id = await createGymCommitment();
    const [fri] = await checkIns(id);
    h.setNow("2026-10-16T22:00:00Z");
    await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);

    h.setNow("2026-10-17T04:00:00Z"); // 00:00 Saturday local, job not yet run
    const undo = await h.api(user, "POST", `/v1/check-ins/${fri!.id}/undo`);
    expect(undo.status).toBe(409);
    expect(undo.body.error.code).toBe("deadline_passed");
  });

  it("a withdrawn mark doesn't count", async () => {
    const id = await createGymCommitment();
    const [fri] = await checkIns(id);
    h.setNow("2026-10-16T22:00:00Z");
    await h.api(user, "POST", `/v1/check-ins/${fri!.id}/done`);
    await h.api(user, "POST", `/v1/check-ins/${fri!.id}/undo`);

    h.setNow("2026-10-17T04:15:00Z");
    expect(await run.resolve()).toEqual({ verified: 0, excused: 1, missed: 0 });
  });
});

describe("free passes and misses", () => {
  it("uses one free pass a month automatically, then charges", async () => {
    const id = await createGymCommitment();

    h.setNow("2026-10-18T05:00:00Z"); // after both Fri and Sat deadlines
    expect(await run.resolve()).toEqual({ verified: 0, excused: 1, missed: 1 });

    const rows = await checkIns(id);
    expect(rows.map((r) => r.status)).toEqual(["excused", "missed"]);

    const { rows: [charge] } = await h.db.query<{ idempotency_key: string; amount_cents: number; status: string }>(
      `select idempotency_key, amount_cents, status from charges where check_in_id = $1`, [rows[1]!.id],
    );
    expect(charge).toEqual({ idempotency_key: `checkin_${rows[1]!.id}`, amount_cents: 500, status: "pending" });

    // Rerunning finds nothing left to decide.
    expect(await run.resolve()).toEqual({ verified: 0, excused: 0, missed: 0 });
  });

  it("charges the stake snapshotted on the check-in, not the current stake", async () => {
    const id = await createGymCommitment();
    await h.db.query(`update commitments set stake_cents = 2000 where id = $1`, [id]);
    h.setNow("2026-10-18T05:00:00Z");
    await run.resolve();
    const { rows: [c] } = await h.db.query<{ amount_cents: number }>(`select amount_cents from charges`);
    expect(c!.amount_cents).toBe(500);
  });

  it("refuses to change a resolved day", async () => {
    const id = await createGymCommitment();
    h.setNow("2026-10-18T05:00:00Z");
    await run.resolve();
    const [fri] = await checkIns(id);
    await expect(
      h.db.query(`update check_ins set status = 'verified' where id = $1`, [fri!.id]),
    ).rejects.toThrow(/terminal/);
  });
});

describe("charging", () => {
  async function missOneDay() {
    await createGymCommitment();
    h.setNow("2026-10-18T05:00:00Z");
    await run.resolve(); // Fri excused, Sat missed
  }

  it("charges once, and rerunning every job never charges again", async () => {
    await missOneDay();
    expect(await run.charge()).toEqual({ succeeded: 1, retrying: 0, failed: 0 });
    expect(h.chargeCalls).toHaveLength(1);
    expect(h.chargeCalls[0]!.idempotencyKey).toMatch(/^checkin_/);
    expect(h.chargeCalls[0]!.amountCents).toBe(500);

    for (let i = 0; i < 3; i++) {
      await run.resolve();
      await run.charge();
    }
    expect(h.chargeCalls).toHaveLength(1);

    const { rows } = await h.db.query<{ status: string }>(`select status from charges`);
    expect(rows).toEqual([{ status: "succeeded" }]);
  });

  it("reclaims a charge stuck in processing after a crash", async () => {
    await missOneDay();
    await h.db.query(
      `update charges set status = 'processing', attempts = 1, locked_at = $1`,
      [new Date("2026-10-18T04:50:00Z")],
    );
    h.setNow("2026-10-18T05:01:00Z"); // 11 minutes later
    expect(await run.charge()).toEqual({ succeeded: 1, retrying: 0, failed: 0 });
  });

  it("retries a decline on the same PaymentIntent, then blocks the user, then unblocks once paid", async () => {
    await missOneDay();
    h.respondToCharges((req) => ({
      ok: false, paymentIntentId: req.existingPaymentIntentId ?? "pi_declined", code: "insufficient_funds", message: "Declined",
    }));

    expect(await run.charge()).toEqual({ succeeded: 0, retrying: 1, failed: 0 });
    expect(await run.charge()).toEqual({ succeeded: 0, retrying: 0, failed: 0 }); // not due yet

    h.setNow("2026-10-18T06:00:00Z"); // +1h
    expect(await run.charge()).toEqual({ succeeded: 0, retrying: 1, failed: 0 });
    h.setNow("2026-10-18T12:00:00Z"); // +6h
    expect(await run.charge()).toEqual({ succeeded: 0, retrying: 0, failed: 1 });

    // Attempts 2 and 3 re-confirmed the first PaymentIntent, never a new one.
    expect(h.chargeCalls.map((c) => c.existingPaymentIntentId)).toEqual([null, "pi_declined", "pi_declined"]);
    expect(h.chargeCalls.map((c) => c.attempt)).toEqual([1, 2, 3]);

    const me = await h.api(user, "GET", "/v1/me");
    expect(me.body.billing).toMatchObject({ blocked: true, amountCents: 500, reason: "insufficient_funds" });

    const blocked = await h.api(user, "POST", "/v1/commitments", {
      title: "Email Sam", scheduleDays: [1], stakeCents: 300, consentText: consentFor("Email Sam", 300),
    });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("billing_blocked");

    // Card fixed: requeue, succeed, unblocked. Attempt numbers keep climbing
    // so Stripe retry keys are never reused.
    h.respondToCharges((req) => ({ ok: true, paymentIntentId: req.existingPaymentIntentId! }));
    await requeueFailedCharges(h.db, user, h.deps.now());
    expect(await run.charge()).toEqual({ succeeded: 1, retrying: 0, failed: 0 });
    expect(h.chargeCalls.at(-1)!.attempt).toBe(4);

    expect((await h.api(user, "GET", "/v1/me")).body.billing).toEqual({ blocked: false });
  });

  it("fails cleanly when there's no card on file", async () => {
    const noCard = await h.createUser("America/New_York", { card: false });
    user = noCard;
    await missOneDay();
    await run.charge();
    expect(h.chargeCalls).toHaveLength(0);
    const { rows: [c] } = await h.db.query<{ last_error_code: string }>(`select last_error_code from charges`);
    expect(c!.last_error_code).toBe("no_payment_method");
  });
});

describe("pausing and deleting", () => {
  it("pausing keeps today's check-in and drops later ones", async () => {
    const id = await createGymCommitment();
    h.setNow("2026-10-16T14:00:00Z"); // Fri 10:00 local — Friday is today
    expect((await h.api(user, "POST", `/v1/commitments/${id}/pause`)).status).toBe(200);
    expect((await checkIns(id)).map((r) => r.due_date)).toEqual(["2026-10-16"]);

    // Paused commitments aren't scheduled.
    h.setNow("2026-10-20T14:00:00Z");
    await run.materialize();
    expect((await checkIns(id)).map((r) => r.due_date)).toEqual(["2026-10-16"]);
  });

  it("resuming starts tomorrow, never today", async () => {
    const id = await createGymCommitment([1, 2, 3, 4, 5, 6, 7]);
    h.setNow("2026-10-16T14:00:00Z");
    await h.api(user, "POST", `/v1/commitments/${id}/pause`);
    h.setNow("2026-10-20T14:00:00Z"); // Tue
    await h.api(user, "POST", `/v1/commitments/${id}/resume`);
    const dates = (await checkIns(id)).map((r) => r.due_date);
    expect(dates).not.toContain("2026-10-20");
    expect(dates).toContain("2026-10-21");
  });

  it("deleting archives and keeps history", async () => {
    const id = await createGymCommitment();
    h.setNow("2026-10-18T05:00:00Z");
    await run.resolve();
    expect((await h.api(user, "DELETE", `/v1/commitments/${id}`)).status).toBe(204);
    expect(await checkIns(id)).toHaveLength(2);
    const list = await h.api(user, "GET", "/v1/commitments");
    expect(list.body).toHaveLength(0);
  });
});

describe("today endpoint", () => {
  it("returns today's check-in and upcoming ones in the app's shapes", async () => {
    await createGymCommitment();
    h.setNow("2026-10-16T14:00:00Z"); // Fri 10:00 local
    const res = await h.api(user, "GET", "/v1/today");
    expect(res.body.today).toHaveLength(1);
    expect(res.body.today[0].checkIn).toMatchObject({ dueDate: "2026-10-16", status: "pending", stakeCents: 500 });
    expect(res.body.today[0].commitment).toMatchObject({ title: "Go to the gym", scheduleDays: [4, 5, 6] });
    expect(res.body.upcoming.map((u: any) => u.checkIn.status)).toEqual(["upcoming"]);
  });
});

describe("notifications", () => {
  it("sends the 6 pm reminder and 10 pm warning once each, only while unverified", async () => {
    user = await h.createUser("America/New_York", { token: "ExponentPushToken[test]" });
    const id = await createGymCommitment();
    const [fri, sat] = await checkIns(id);

    h.setNow("2026-10-16T21:00:00Z"); // Fri 17:00 local — too early
    expect(await run.notify()).toMatchObject({ reminders: 0, warnings: 0 });

    h.setNow("2026-10-16T22:05:00Z"); // 18:05
    expect(await run.notify()).toMatchObject({ reminders: 1, warnings: 0 });
    expect(await run.notify()).toMatchObject({ reminders: 0, warnings: 0 }); // no duplicate
    expect(h.pushes[0]!.body).toContain("$5 at stake");

    h.setNow("2026-10-17T02:05:00Z"); // 22:05
    expect(await run.notify()).toMatchObject({ reminders: 0, warnings: 1 });

    // Saturday: marked done before 6 pm → no reminder at all.
    h.setNow("2026-10-17T16:00:00Z");
    await h.api(user, "POST", `/v1/check-ins/${sat!.id}/done`);
    h.setNow("2026-10-17T22:05:00Z");
    expect(await run.notify()).toMatchObject({ reminders: 0, warnings: 0 });

    const { rows } = await h.db.query<{ kind: string; status: string }>(
      `select kind, status from notifications_log where check_in_id = $1 order by created_at`, [fri!.id],
    );
    expect(rows).toEqual([{ kind: "reminder", status: "sent" }, { kind: "final_warning", status: "sent" }]);
  });

  it("sends nothing and logs nothing when disabled", async () => {
    user = await h.createUser("America/New_York", { token: "ExponentPushToken[test]" });
    await createGymCommitment();
    h.deps.notificationsEnabled = false;
    h.setNow("2026-10-16T22:05:00Z");
    expect(await run.notify()).toMatchObject({ skipped: true });
    const { rows } = await h.db.query(`select 1 from notifications_log`);
    expect(rows).toHaveLength(0);
  });
});
