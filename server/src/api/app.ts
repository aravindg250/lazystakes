/**
 * app.ts — the REST API the app calls.
 *
 * The app renders, the server decides. Every rule that affects money —
 * whether a mark counts, whether undo is still allowed, whether a new
 * commitment can be created — is enforced here against the server clock,
 * whatever the device shows.
 *
 * Auth: every /v1 request carries the Supabase session token as
 * `Authorization: Bearer <token>`. The users row is created on the first
 * signed-in request, with the device's timezone from `x-timezone`.
 * DEV_AUTH additionally lets local requests pick a user with an
 * `x-dev-user-id` header; it must never be on in production.
 */

import { isIP } from "node:net";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import type { Queryable } from "../db";
import type { Deps } from "../deps";
import { materializeForCommitment, type CommitmentForSchedule } from "../jobs/materializeCheckIns";
import { addDays, dayStartUtc, isValidTimezone, localDate } from "../time";
import {
  CHECK_IN_COLUMNS, COMMITMENT_COLUMNS, checkInView, commitmentView,
  type CheckInRow, type CommitmentRow,
} from "./views";
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS, formatMoney } from "../money";

type Env = { Variables: { userId: string } };

class ApiError extends Error {
  constructor(public status: ContentfulStatusCode, public code: string, message: string) {
    super(message);
  }
}

const uuid = z.uuid();

export function createApp(deps: Deps) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // ---------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------

  app.use("/v1/*", async (c, next) => {
    const bearer = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (bearer) {
      if (!deps.auth) throw new ApiError(401, "auth_not_configured", "Sign-in isn't set up on the server");
      const result = await deps.auth.verify(bearer);
      if (!result.ok) {
        throw result.reason === "anonymous"
          ? new ApiError(401, "anonymous_not_allowed", "Sign in with an account to continue")
          : new ApiError(401, "unauthenticated", "Your session has expired. Sign in again.");
      }
      // First request after sign-in creates the account. A missing or bad
      // timezone falls back to UTC; the app corrects it with PATCH /v1/me.
      const tz = c.req.header("x-timezone");
      try {
        await deps.db.query(
          `insert into users (id, timezone) values ($1, $2) on conflict (id) do nothing`,
          [result.userId, tz && isValidTimezone(tz) ? tz : "UTC"],
        );
      } catch (err) {
        // A still-valid token for an auth user that has since been deleted.
        if ((err as { code?: string }).code === "23503") {
          throw new ApiError(401, "unauthenticated", "This account no longer exists");
        }
        throw err;
      }
      c.set("userId", result.userId);
      return next();
    }

    if (deps.devAuth) {
      const id = c.req.header("x-dev-user-id");
      if (!id || !uuid.safeParse(id).success) {
        throw new ApiError(401, "unauthenticated", "Missing or invalid x-dev-user-id");
      }
      const { rows } = await deps.db.query(`select 1 from users where id = $1`, [id]);
      if (rows.length === 0) throw new ApiError(401, "unauthenticated", "Unknown user");
      c.set("userId", id);
      return next();
    }

    throw deps.auth
      ? new ApiError(401, "unauthenticated", "Sign in to continue")
      : new ApiError(401, "auth_not_configured", "Sign-in isn't set up on the server");
  });

  // ---------------------------------------------------------------
  // Me
  // ---------------------------------------------------------------

  app.get("/v1/me", async (c) => {
    const userId = c.get("userId");
    const { rows: [u] } = await deps.db.query<{
      timezone: string; remind_enabled: boolean; final_warning_enabled: boolean; receipts_enabled: boolean;
    }>(
      `select timezone, remind_enabled, final_warning_enabled, receipts_enabled from users where id = $1`,
      [userId],
    );
    const { rows: [pm] } = await deps.db.query<{
      brand: string; last4: string; exp_month: number; exp_year: number;
    }>(
      `select brand, last4, exp_month, exp_year from payment_methods where user_id = $1 and is_default`,
      [userId],
    );
    return c.json({
      timezone: u!.timezone,
      settings: {
        remindEnabled: u!.remind_enabled,
        finalWarningEnabled: u!.final_warning_enabled,
        receiptsEnabled: u!.receipts_enabled,
      },
      paymentMethod: pm
        ? { brand: pm.brand, last4: pm.last4, expMonth: pm.exp_month, expYear: pm.exp_year }
        : null,
      billing: await billingBlock(deps.db, userId),
    });
  });

  const patchMe = z.object({
    timezone: z.string().refine(isValidTimezone, "Unknown timezone").optional(),
    remindEnabled: z.boolean().optional(),
    finalWarningEnabled: z.boolean().optional(),
    receiptsEnabled: z.boolean().optional(),
    expoPushToken: z.string().max(200).nullable().optional(),
  }).strict();

  app.patch("/v1/me", async (c) => {
    const body = parse(patchMe, await c.req.json().catch(() => null));
    // Timezone changes apply to new commitments only; existing ones keep the
    // zone they were created in, so travel never moves a deadline.
    await deps.db.query(
      `update users set
         timezone = coalesce($2, timezone),
         remind_enabled = coalesce($3, remind_enabled),
         final_warning_enabled = coalesce($4, final_warning_enabled),
         receipts_enabled = coalesce($5, receipts_enabled),
         expo_push_token = case when $6::boolean then $7 else expo_push_token end
       where id = $1`,
      [
        c.get("userId"),
        body.timezone ?? null,
        body.remindEnabled ?? null,
        body.finalWarningEnabled ?? null,
        body.receiptsEnabled ?? null,
        body.expoPushToken !== undefined,
        body.expoPushToken ?? null,
      ],
    );
    return c.body(null, 204);
  });

  // ---------------------------------------------------------------
  // Today
  // ---------------------------------------------------------------

  app.get("/v1/today", async (c) => {
    const userId = c.get("userId");
    const now = deps.now();

    // Today and the next week, each judged in its own commitment's timezone.
    const { rows: checkIns } = await deps.db.query<CheckInRow & { timezone: string }>(
      `select ${CHECK_IN_COLUMNS}, c.timezone
         from check_ins ci
         join commitments c on c.id = ci.commitment_id
        where ci.user_id = $1
          and ci.due_date >= (($2::timestamptz) at time zone c.timezone)::date
          and ci.due_date <= (($2::timestamptz) at time zone c.timezone)::date + 7
        order by ci.deadline_utc`,
      [userId, now],
    );
    const { rows: commitments } = await deps.db.query<CommitmentRow>(
      `select ${COMMITMENT_COLUMNS} from commitments c where c.id = any($1::uuid[])`,
      [[...new Set(checkIns.map((ci) => ci.commitment_id))]],
    );
    const byId = new Map(commitments.map((cm) => [cm.id, commitmentView(cm)]));

    // "This month" for each commitment due today: days so far (today
    // included), days kept (a live mark counts), free passes used.
    const todayIds = checkIns.filter((r) => r.due_date === localDate(r.timezone, now)).map((r) => r.commitment_id);
    const { rows: months } = await deps.db.query<{
      commitment_id: string; scheduled: number; completed: number; passes_used: number;
    }>(
      `select c.id as commitment_id,
              count(ci.id)::int as scheduled,
              count(ci.id) filter (where ci.status = 'verified'
                or (ci.status = 'pending' and exists (
                  select 1 from evidence e where e.check_in_id = ci.id and e.withdrawn_at is null)))::int as completed,
              (select count(*)::int from free_pass_usage f
                where f.commitment_id = c.id
                  and f.month = date_trunc('month', ($2::timestamptz) at time zone c.timezone)::date) as passes_used
         from commitments c
         left join check_ins ci on ci.commitment_id = c.id
          and ci.due_date >= date_trunc('month', ($2::timestamptz) at time zone c.timezone)::date
          and ci.due_date <= (($2::timestamptz) at time zone c.timezone)::date
        where c.id = any($1::uuid[])
        group by c.id`,
      [todayIds, now],
    );
    const monthById = new Map(months.map((m) => [m.commitment_id, {
      completed: m.completed, scheduled: m.scheduled, passesUsed: m.passes_used,
    }]));

    const items = checkIns.map((r) => {
      const today = localDate(r.timezone, now);
      return {
        isToday: r.due_date === today,
        item: {
          checkIn: checkInView(r, today),
          commitment: byId.get(r.commitment_id)!,
          month: monthById.get(r.commitment_id) ?? null,
        },
      };
    });

    return c.json({
      today: items.filter((i) => i.isToday).map((i) => i.item),
      upcoming: items.filter((i) => !i.isToday).map((i) => i.item),
    });
  });

  // ---------------------------------------------------------------
  // Commitments
  // ---------------------------------------------------------------

  app.get("/v1/commitments", async (c) => {
    const { rows } = await deps.db.query<CommitmentRow & Stats>(
      `select ${COMMITMENT_COLUMNS}, ${STATS_COLUMNS}
         from commitments c
        where c.user_id = $1 and c.status <> 'archived'
        order by (c.status = 'active') desc, c.created_at desc`,
      [c.get("userId")],
    );
    return c.json(rows.map((r) => ({ commitment: commitmentView(r), stats: statsView(r) })));
  });

  app.get("/v1/commitments/:id", async (c) => {
    const userId = c.get("userId");
    const id = param(c, "id");
    const now = deps.now();
    const { rows: [row] } = await deps.db.query<CommitmentRow & Stats & { timezone: string }>(
      `select ${COMMITMENT_COLUMNS}, ${STATS_COLUMNS}, c.timezone
         from commitments c
        where c.id = $1 and c.user_id = $2`,
      [id, userId],
    );
    if (!row) throw new ApiError(404, "not_found", "Commitment not found");

    const today = localDate(row.timezone, now);
    const { rows: history } = await deps.db.query<CheckInRow>(
      `select ${CHECK_IN_COLUMNS}
         from check_ins ci
        where ci.commitment_id = $1 and ci.due_date <= $2
        order by ci.due_date desc
        limit 400`,
      [id, today],
    );

    return c.json({
      commitment: commitmentView(row),
      stats: statsView(row),
      history: history.map((h) => checkInView(h, today)),
    });
  });

  const createCommitment = z.object({
    title: z.string().trim().min(1).max(120),
    scheduleDays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
      .refine((d) => new Set(d).size === d.length, "Duplicate days"),
    stakeCents: z.number().int().min(MIN_STAKE_CENTS).max(MAX_STAKE_CENTS),
    consentText: z.string().min(20).max(2000),
  }).strict();

  app.post("/v1/commitments", async (c) => {
    const userId = c.get("userId");
    const body = parse(createCommitment, await c.req.json().catch(() => null));
    const now = deps.now();

    // The consent record is dispute evidence: it must be the language the
    // user actually agreed to, and that language must name this amount and
    // this task. Reject anything that doesn't, rather than store it.
    if (!body.consentText.includes(formatMoney(body.stakeCents)) || !body.consentText.includes(body.title)) {
      throw new ApiError(400, "consent_mismatch", "Consent text must name the stake and the commitment");
    }

    const created = await deps.db.tx(async (q) => {
      await assertNotBlocked(q, userId);
      const { rows: [u] } = await q.query<{ timezone: string }>(
        `select timezone from users where id = $1`, [userId],
      );
      const tz = u!.timezone;
      // Never same-day: the first schedulable date is tomorrow, local time.
      const startsOn = addDays(localDate(tz, now), 1);

      const { rows: [cm] } = await q.query<CommitmentRow & CommitmentForSchedule>(
        `insert into commitments (user_id, title, schedule_days, stake_cents, timezone, starts_on, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, user_id, title, schedule_days, stake_cents, timezone,
                   deadline_local_time::text as deadline_local_time, free_passes_per_month,
                   status, created_at, starts_on`,
        [userId, body.title, [...body.scheduleDays].sort(), body.stakeCents, tz, startsOn, now],
      );

      await q.query(
        `insert into consent_records (user_id, commitment_id, consent_text, ip_address, user_agent, accepted_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [userId, cm!.id, body.consentText, clientIp(c), c.req.header("user-agent") ?? null, now],
      );

      await materializeForCommitment(q, cm!, now);
      return cm!;
    });

    return c.json(commitmentView(created), 201);
  });

  app.post("/v1/commitments/:id/pause", async (c) => {
    const view = await deps.db.tx(async (q) => {
      const cm = await lockCommitment(q, param(c, "id"), c.get("userId"));
      if (cm.status !== "active") throw new ApiError(409, "not_active", "Only an active commitment can be paused");
      await q.query(`update commitments set status = 'paused', paused_at = $2 where id = $1`, [cm.id, deps.now()]);
      // Today still counts: pausing is never an escape from a day in progress.
      await dropFutureCheckIns(q, cm.id, localDate(cm.timezone, deps.now()));
      return commitmentView({ ...cm, status: "paused" });
    });
    return c.json(view);
  });

  app.post("/v1/commitments/:id/resume", async (c) => {
    const now = deps.now();
    const view = await deps.db.tx(async (q) => {
      const userId = c.get("userId");
      await assertNotBlocked(q, userId);
      const cm = await lockCommitment(q, param(c, "id"), userId);
      if (cm.status !== "paused") throw new ApiError(409, "not_paused", "Only a paused commitment can be resumed");
      const startsOn = addDays(localDate(cm.timezone, now), 1);
      await q.query(
        `update commitments set status = 'active', paused_at = null, starts_on = $2 where id = $1`,
        [cm.id, startsOn],
      );
      await materializeForCommitment(q, { ...cm, starts_on: startsOn }, now);
      return commitmentView({ ...cm, status: "active" });
    });
    return c.json(view);
  });

  app.delete("/v1/commitments/:id", async (c) => {
    await deps.db.tx(async (q) => {
      const cm = await lockCommitment(q, param(c, "id"), c.get("userId"));
      if (cm.status === "archived") return;
      // Archive rather than delete: history and charges must survive.
      await q.query(`update commitments set status = 'archived', archived_at = $2 where id = $1`, [cm.id, deps.now()]);
      // Like pausing, today still counts.
      await dropFutureCheckIns(q, cm.id, localDate(cm.timezone, deps.now()));
    });
    return c.body(null, 204);
  });

  // ---------------------------------------------------------------
  // Marking done
  // ---------------------------------------------------------------

  app.post("/v1/check-ins/:id/done", async (c) => {
    const now = deps.now();
    const view = await deps.db.tx(async (q) => {
      const ci = await lockOpenCheckIn(q, param(c, "id"), c.get("userId"), now);
      // Idempotent: a second mark (double tap, retry after timeout) is a no-op.
      await q.query(
        `insert into evidence (check_in_id, user_id, kind, server_received_at)
         values ($1, $2, 'self_report', $3)
         on conflict (check_in_id) where kind = 'self_report' and withdrawn_at is null do nothing`,
        [ci.id, c.get("userId"), now],
      );
      return readCheckIn(q, ci.id, ci.timezone, now);
    });
    return c.json(view);
  });

  app.post("/v1/check-ins/:id/undo", async (c) => {
    const now = deps.now();
    const view = await deps.db.tx(async (q) => {
      const ci = await lockOpenCheckIn(q, param(c, "id"), c.get("userId"), now);
      // Withdraw rather than delete, so the trail survives a dispute.
      await q.query(
        `update evidence set withdrawn_at = $2 where check_in_id = $1 and withdrawn_at is null`,
        [ci.id, now],
      );
      return readCheckIn(q, ci.id, ci.timezone, now);
    });
    return c.json(view);
  });

  // ---------------------------------------------------------------
  // Charges
  // ---------------------------------------------------------------

  app.get("/v1/charges", async (c) => {
    const { rows } = await deps.db.query<CheckInRow & {
      charge_id: string; amount_cents: number; charge_status: string; title: string; created_at_charge: Date;
    }>(
      `select ${CHECK_IN_COLUMNS}, ch.id as charge_id, ch.amount_cents, ch.status as charge_status,
              c.title, ch.created_at as created_at_charge
         from charges ch
         join check_ins ci on ci.id = ch.check_in_id
         join commitments c on c.id = ci.commitment_id
        where ch.user_id = $1
        order by ci.due_date desc`,
      [c.get("userId")],
    );
    return c.json(rows.map((r) => ({
      id: r.charge_id,
      amountCents: r.amount_cents,
      status: r.charge_status,
      commitmentTitle: r.title,
      checkIn: checkInView(r, r.due_date),
    })));
  });

  return app;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

type Stats = { kept: number; missed: number; excused: number; paid_cents: number };

const STATS_COLUMNS = `
  (select count(*)::int from check_ins x where x.commitment_id = c.id and x.status = 'verified') as kept,
  (select count(*)::int from check_ins x where x.commitment_id = c.id and x.status = 'missed') as missed,
  (select count(*)::int from check_ins x where x.commitment_id = c.id and x.status = 'excused') as excused,
  (select coalesce(sum(ch.amount_cents), 0)::int from charges ch
     join check_ins x on x.id = ch.check_in_id
    where x.commitment_id = c.id and ch.status = 'succeeded') as paid_cents`;

function statsView(r: Stats) {
  const total = r.kept + r.missed + r.excused;
  return {
    kept: r.kept,
    missed: r.missed,
    excused: r.excused,
    total,
    paidCents: r.paid_cents,
    rate: total === 0 ? 0 : r.kept / total,
  };
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ApiError(400, "invalid_request", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return r.data;
}

function param(c: Context<Env>, name: string): string {
  const v = c.req.param(name);
  if (!v || !uuid.safeParse(v).success) throw new ApiError(404, "not_found", "Not found");
  return v;
}

function clientIp(c: Context<Env>): string | null {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && isIP(ip) ? ip : null;
}

/**
 * A charge that failed every retry blocks new and resumed commitments until
 * it's paid. Existing active commitments keep running.
 */
export async function billingBlock(q: Queryable, userId: string) {
  const { rows: [f] } = await q.query<{ id: string; amount_cents: number; last_error_code: string | null }>(
    `select id, amount_cents, last_error_code from charges
      where user_id = $1 and status = 'failed'
      order by created_at limit 1`,
    [userId],
  );
  return f
    ? { blocked: true as const, failedChargeId: f.id, amountCents: f.amount_cents, reason: f.last_error_code }
    : { blocked: false as const };
}

async function assertNotBlocked(q: Queryable, userId: string) {
  const b = await billingBlock(q, userId);
  if (b.blocked) {
    throw new ApiError(
      402, "billing_blocked",
      `A ${formatMoney(b.amountCents)} charge couldn't be completed. Update your card to continue.`,
    );
  }
}

async function lockCommitment(q: Queryable, id: string, userId: string) {
  const { rows: [cm] } = await q.query<CommitmentRow & CommitmentForSchedule>(
    `select ${COMMITMENT_COLUMNS}, c.user_id, c.timezone, c.starts_on
       from commitments c
      where c.id = $1 and c.user_id = $2
      for update`,
    [id, userId],
  );
  if (!cm) throw new ApiError(404, "not_found", "Commitment not found");
  return cm;
}

async function dropFutureCheckIns(q: Queryable, commitmentId: string, today: string) {
  await q.query(
    `delete from check_ins ci
      where ci.commitment_id = $1 and ci.status = 'pending' and ci.due_date > $2
        and not exists (select 1 from evidence e where e.check_in_id = ci.id)
        and not exists (select 1 from notifications_log n where n.check_in_id = ci.id)`,
    [commitmentId, today],
  );
}

/** Locks a check-in that can still be marked or undone right now. */
async function lockOpenCheckIn(q: Queryable, id: string, userId: string, now: Date) {
  const { rows: [ci] } = await q.query<{
    id: string; status: string; due_date: string; deadline_utc: Date; timezone: string;
  }>(
    `select ci.id, ci.status, ci.due_date, ci.deadline_utc, c.timezone
       from check_ins ci join commitments c on c.id = ci.commitment_id
      where ci.id = $1 and ci.user_id = $2
      for update of ci`,
    [id, userId],
  );
  if (!ci) throw new ApiError(404, "not_found", "Check-in not found");
  if (ci.status !== "pending" || now >= ci.deadline_utc) {
    throw new ApiError(409, "deadline_passed", "This day has already been decided");
  }
  if (now < dayStartUtc(ci.due_date, ci.timezone)) {
    throw new ApiError(409, "not_due_yet", "This day hasn't started yet");
  }
  return ci;
}

async function readCheckIn(q: Queryable, id: string, timezone: string, now: Date) {
  const { rows: [r] } = await q.query<CheckInRow>(
    `select ${CHECK_IN_COLUMNS} from check_ins ci where ci.id = $1`, [id],
  );
  return checkInView(r!, localDate(timezone, now));
}
