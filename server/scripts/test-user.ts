/**
 * test-user.ts — creates a sign-in user plus its LazyStakes row, for the
 * seed and exit-test scripts. Real users come from Sign in with Apple.
 *
 * The auth row is minimal (no password, no identity), so it can't be signed
 * into; it shows in Supabase → Authentication with a @lazystakes.test email
 * so test users are easy to spot.
 */

import type { Queryable } from "../src/db";

export async function createTestUser(db: Queryable, label: string, timezone: string, stripeCustomerId: string) {
  const email = `${label}-${Date.now()}@lazystakes.test`;
  const { rows: [user] } = await db.query<{ id: string }>(
    `with a as (
       insert into auth.users (id, aud, role, email, created_at, updated_at)
       values (gen_random_uuid(), 'authenticated', 'authenticated', $1, now(), now())
       returning id
     )
     insert into users (id, timezone, stripe_customer_id)
     select a.id, $2, $3 from a
     returning id`,
    [email, timezone, stripeCustomerId],
  );
  return { id: user!.id, email };
}
