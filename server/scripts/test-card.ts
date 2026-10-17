/**
 * test-card.ts — give a signed-in account Stripe's test Visa, until the
 * real card screen exists (Phase 4).
 *
 *   npm run test-card -- you@example.com
 *
 * Sign in on the phone first so the account exists. Requires a TEST
 * Stripe key: pm_card_visa only exists in test mode, and nothing real is
 * ever charged.
 */

import { createRuntime } from "../src/runtime";

const email = process.argv[2];
if (!email) throw new Error("Usage: npm run test-card -- you@example.com");

const { deps, stripe, config } = createRuntime();
if (!stripe) throw new Error("STRIPE_SECRET_KEY is not set");
if (!config.stripeSecretKey!.startsWith("sk_test_")) throw new Error("test-card only runs with a Stripe TEST key");

try {
  const { rows: [u] } = await deps.db.query<{ id: string; stripe_customer_id: string | null }>(
    `select u.id, u.stripe_customer_id
       from users u join auth.users a on a.id = u.id
      where lower(a.email) = lower($1)`,
    [email],
  );
  if (!u) throw new Error(`No LazyStakes account for ${email}. Sign in on the phone first.`);

  let customerId = u.stripe_customer_id;
  if (!customerId) {
    customerId = (await stripe.customers.create({ email, description: "LazyStakes (test card)" })).id;
    await deps.db.query(`update users set stripe_customer_id = $2 where id = $1`, [u.id, customerId]);
  }
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });

  await deps.db.tx(async (q) => {
    await q.query(`update payment_methods set is_default = false where user_id = $1`, [u.id]);
    await q.query(
      `insert into payment_methods (user_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
       values ($1, $2, $3, $4, $5, $6, true)`,
      [u.id, pm.id, pm.card!.brand, pm.card!.last4, pm.card!.exp_month, pm.card!.exp_year],
    );
  });
  console.log(`${email}: test ${pm.card!.brand} ${pm.card!.last4} is now the default card (customer ${customerId}).`);
} finally {
  await deps.db.close();
}
