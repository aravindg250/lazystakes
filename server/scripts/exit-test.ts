/**
 * exit-test.ts — the Phase 2 exit test, against the real database and
 * Stripe in test mode.
 *
 *   npm run exit-test
 *
 * From the spec: "Do not move on until you've watched a test card get
 * charged for a missed check-in and confirmed that rerunning the job
 * doesn't charge it twice."
 *
 * Steps:
 *   1. Create a user with a Stripe test card.
 *   2. Create a commitment due today with a deadline ~2 minutes out and no
 *      free passes. (Inserted directly: the API correctly refuses same-day
 *      commitments.)
 *   3. Wait for the deadline, without marking it done.
 *   4. Run resolve + charge. Expect: missed, one charge, succeeded.
 *   5. Run resolve + charge three more times. Expect: still one charge.
 *   6. Ask Stripe directly: exactly one succeeded PaymentIntent for this
 *      customer, for the right amount — and re-sending the original create
 *      request with the same idempotency key returns that same PaymentIntent.
 *
 * Refuses to run with a live Stripe key.
 */

import { DateTime } from "luxon";

import { createRuntime } from "../src/runtime";
import { runJob } from "../src/scheduler";
import { deadlineUtc, localDate } from "../src/time";
import { createTestUser } from "./test-user";

const TZ = "America/New_York";
const STAKE = 500;

const { deps, stripe, config } = createRuntime();
if (!stripe) throw new Error("STRIPE_SECRET_KEY is not set");
if (!config.stripeSecretKey!.startsWith("sk_test_")) throw new Error("exit-test only runs with a Stripe TEST key");

const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);
function check(ok: boolean, msg: string) {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) { process.exitCode = 1; throw new Error(`Exit test failed: ${msg}`); }
}

try {
  step(1, "Creating test user with Stripe test card");
  const customer = await stripe.customers.create({ description: "LazyStakes exit test" });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  const user = await createTestUser(deps.db, "exit-test", TZ, customer.id);
  await deps.db.query(
    `insert into payment_methods (user_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
     values ($1, $2, $3, $4, $5, $6, true)`,
    [user.id, pm.id, pm.card!.brand, pm.card!.last4, pm.card!.exp_month, pm.card!.exp_year],
  );
  console.log(`    user ${user.id}, customer ${customer.id}`);

  step(2, "Creating a commitment due today, deadline ~2 minutes out");
  const now = new Date();
  const today = localDate(TZ, now);
  const deadlineLocal = DateTime.fromJSDate(now, { zone: TZ }).plus({ minutes: 2 }).toFormat("HH:mm");
  if (deadlineLocal < DateTime.fromJSDate(now, { zone: TZ }).toFormat("HH:mm")) {
    throw new Error("Too close to local midnight — run again in a few minutes");
  }
  const weekday = DateTime.fromISO(today).weekday;
  const { rows: [cm] } = await deps.db.query<{ id: string }>(
    // No free passes, or the miss would correctly be excused instead of charged.
    `insert into commitments (user_id, title, schedule_days, stake_cents, timezone, deadline_local_time, starts_on, free_passes_per_month)
     values ($1, 'Exit test', $2, $3, $4, $5, $6, 0) returning id`,
    [user.id, [weekday], STAKE, TZ, deadlineLocal, today],
  );
  await runJob("materialize", deps);
  const { rows: [ci] } = await deps.db.query<{ id: string; deadline_utc: Date }>(
    `select id, deadline_utc from check_ins where commitment_id = $1`, [cm!.id],
  );
  check(!!ci, "check-in materialized for today");
  check(
    ci!.deadline_utc.getTime() === deadlineUtc(today, deadlineLocal, TZ).getTime(),
    `deadline is ${deadlineLocal} ${TZ} (${ci!.deadline_utc.toISOString()})`,
  );

  step(3, "Waiting for the deadline to pass (not marking it done)");
  const waitMs = ci!.deadline_utc.getTime() - Date.now() + 2000;
  console.log(`    waiting ${Math.ceil(waitMs / 1000)}s…`);
  await new Promise((r) => setTimeout(r, waitMs));

  step(4, "Running resolve + charge");
  await runJob("resolve", deps);
  await runJob("charge", deps);
  const charges = async () => (await deps.db.query<{
    id: string; status: string; amount_cents: number; stripe_payment_intent_id: string; idempotency_key: string;
  }>(`select id, status, amount_cents, stripe_payment_intent_id, idempotency_key from charges where check_in_id = $1`, [ci!.id])).rows;
  const { rows: [resolved] } = await deps.db.query<{ status: string }>(`select status from check_ins where id = $1`, [ci!.id]);
  check(resolved!.status === "missed", "check-in resolved as missed");
  const [first] = await charges();
  check(first?.status === "succeeded", `charge succeeded (${first?.stripe_payment_intent_id})`);

  step(5, "Rerunning resolve + charge three times");
  for (let i = 0; i < 3; i++) {
    await runJob("resolve", deps);
    await runJob("charge", deps);
  }
  const after = await charges();
  check(after.length === 1, "still exactly one charge row");

  step(6, "Checking Stripe directly");
  const pis = await stripe.paymentIntents.list({ customer: customer.id, limit: 10 });
  const succeeded = pis.data.filter((p) => p.status === "succeeded");
  check(succeeded.length === 1, "exactly one succeeded PaymentIntent for this customer");
  check(succeeded[0]!.amount === STAKE, `amount is ${STAKE} cents`);

  const replay = await stripe.paymentIntents.create(
    {
      amount: STAKE, currency: "usd", customer: customer.id, payment_method: pm.id,
      off_session: true, confirm: true, description: "LazyStakes missed day",
      metadata: { charge_id: first!.id, check_in_id: ci!.id },
    },
    { idempotencyKey: first!.idempotency_key },
  );
  check(replay.id === first!.stripe_payment_intent_id, "replaying the create with the same key returns the same PaymentIntent");
  const pisAfter = await stripe.paymentIntents.list({ customer: customer.id, limit: 10 });
  check(pisAfter.data.length === pis.data.length, "no new PaymentIntent was created by the replay");

  console.log("\nExit test passed. Phase 2's money loop works and doesn't double-charge.");
  console.log(`See it in Stripe: https://dashboard.stripe.com/test/customers/${customer.id}`);
} finally {
  await deps.db.close();
}
