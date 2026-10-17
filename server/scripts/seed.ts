/**
 * seed.ts — create a test user with a Stripe test card.
 *
 *   npm run seed -- [timezone]        default America/New_York
 *
 * Prints the user id; send it as `x-dev-user-id` when calling the API with
 * DEV_AUTH=true. Requires a TEST Stripe key — it attaches Stripe's
 * pm_card_visa test card, which only exists in test mode.
 */

import { createRuntime } from "../src/runtime";
import { isValidTimezone } from "../src/time";
import { createTestUser } from "./test-user";

const tz = process.argv[2] ?? "America/New_York";
if (!isValidTimezone(tz)) throw new Error(`Unknown timezone: ${tz}`);

const { deps, stripe, config } = createRuntime();
if (!stripe) throw new Error("STRIPE_SECRET_KEY is not set");
if (!config.stripeSecretKey!.startsWith("sk_test_")) throw new Error("seed only runs with a Stripe TEST key");

const customer = await stripe.customers.create({ description: "LazyStakes seed user" });
const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

const user = await createTestUser(deps.db, "seed", tz, customer.id);
await deps.db.query(
  `insert into payment_methods (user_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
   values ($1, $2, $3, $4, $5, $6, true)`,
  [user.id, pm.id, pm.card!.brand, pm.card!.last4, pm.card!.exp_month, pm.card!.exp_year],
);

console.log(`User ${user.id}`);
console.log(`  email           ${user.email}`);
console.log(`  timezone        ${tz}`);
console.log(`  stripe customer ${customer.id}`);
console.log(`  card            ${pm.card!.brand} ${pm.card!.last4}`);
await deps.db.close();
