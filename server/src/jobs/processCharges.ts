/**
 * processCharges — send queued charges to Stripe.
 *
 * Runs every 15 minutes, separately from resolveDeadlines, so a Stripe
 * outage delays charges without ever blocking deadlines from resolving.
 *
 * Claiming: a charge is flipped to `processing` (attempts + 1) in a short
 * transaction, then Stripe is called outside it. A worker that crashes
 * mid-call leaves the row `processing`; after LOCK_TIMEOUT it's reclaimed,
 * and the Stripe gateway's idempotency guarantees the retry can't charge
 * twice.
 *
 * Failure: up to MAX_CHARGE_ATTEMPTS tries, spaced by
 * CHARGE_RETRY_DELAYS_MS. After the last, the charge is `failed` and the
 * user is blocked from creating or resuming commitments until it's paid
 * (see billingBlock in api/app.ts). requeueFailedCharges puts them back in
 * the queue once the card is fixed.
 */

import type { Queryable } from "../db";
import type { Deps } from "../deps";
import { CHARGE_RETRY_DELAYS_MS, MAX_CHARGE_ATTEMPTS } from "../config";

const BATCH = 20;
const LOCK_TIMEOUT_MS = 10 * 60_000;

type Claimed = {
  id: string;
  check_in_id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
  stripe_payment_intent_id: string | null;
  attempts: number;
  max_attempts: number;
};

export async function processCharges(
  deps: Pick<Deps, "db" | "now" | "charges">,
): Promise<{ succeeded: number; retrying: number; failed: number }> {
  const out = { succeeded: 0, retrying: 0, failed: 0 };
  const now = deps.now();

  for (;;) {
    const claimed = await deps.db.tx((q) => claim(q, now));
    for (const ch of claimed) out[await attempt(deps, ch, now)]++;
    if (claimed.length < BATCH) break;
  }
  return out;
}

async function claim(q: Queryable, now: Date): Promise<Claimed[]> {
  const { rows } = await q.query<Claimed>(
    `update charges
        set status = 'processing', locked_at = $1, attempts = attempts + 1
      where id in (
        select id from charges
         where (status = 'pending' and next_attempt_at <= $1)
            or (status = 'processing' and locked_at < $2)
         order by next_attempt_at
         limit ${BATCH}
         for update skip locked)
      returning id, check_in_id, user_id, amount_cents, currency, idempotency_key,
                stripe_payment_intent_id, attempts, max_attempts`,
    [now, new Date(now.getTime() - LOCK_TIMEOUT_MS)],
  );
  return rows;
}

async function attempt(
  deps: Pick<Deps, "db" | "charges">, ch: Claimed, now: Date,
): Promise<"succeeded" | "retrying" | "failed"> {
  const { rows: [card] } = await deps.db.query<{ customer: string | null; pm: string | null }>(
    `select u.stripe_customer_id as customer, pm.stripe_payment_method_id as pm
       from users u
       left join payment_methods pm on pm.user_id = u.id and pm.is_default
      where u.id = $1`,
    [ch.user_id],
  );

  const result = card?.customer && card.pm
    ? await deps.charges.charge({
        chargeId: ch.id,
        checkInId: ch.check_in_id,
        idempotencyKey: ch.idempotency_key,
        attempt: ch.attempts,
        amountCents: ch.amount_cents,
        currency: ch.currency,
        customerId: card.customer,
        paymentMethodId: card.pm,
        existingPaymentIntentId: ch.stripe_payment_intent_id,
      })
    : { ok: false as const, paymentIntentId: null, code: "no_payment_method", message: "No default card on file" };

  if (result.ok) {
    await deps.db.query(
      `update charges
          set status = 'succeeded', stripe_payment_intent_id = $2, succeeded_at = $3,
              locked_at = null, last_error_code = null, last_error_message = null
        where id = $1`,
      [ch.id, result.paymentIntentId, now],
    );
    return "succeeded";
  }

  const exhausted = ch.attempts >= ch.max_attempts;
  // Position within the current round of retries (1, 2, 3), so a requeued
  // charge gets the same spacing as a fresh one.
  const roundAttempt = ch.attempts - (ch.max_attempts - MAX_CHARGE_ATTEMPTS);
  const delay = CHARGE_RETRY_DELAYS_MS[roundAttempt - 1] ?? CHARGE_RETRY_DELAYS_MS.at(-1)!;
  await deps.db.query(
    `update charges
        set status = $2,
            stripe_payment_intent_id = coalesce($3, stripe_payment_intent_id),
            next_attempt_at = $4,
            failed_at = $5,
            locked_at = null,
            last_error_code = $6,
            last_error_message = $7
      where id = $1`,
    [
      ch.id,
      exhausted ? "failed" : "pending",
      result.paymentIntentId,
      new Date(now.getTime() + delay),
      exhausted ? now : null,
      result.code,
      result.message,
    ],
  );
  return exhausted ? "failed" : "retrying";
}

/**
 * Put a user's failed charges back in the queue for another round of
 * MAX_CHARGE_ATTEMPTS tries — called
 * when they add or fix a card (wired to the Stripe webhook in Phase 4).
 * The user stays blocked until the charges actually succeed.
 */
export async function requeueFailedCharges(q: Queryable, userId: string, now: Date): Promise<number> {
  const { rows } = await q.query(
    `update charges
        set status = 'pending', max_attempts = attempts + $3, next_attempt_at = $2, failed_at = null
      where user_id = $1 and status = 'failed'
      returning id`,
    [userId, now, MAX_CHARGE_ATTEMPTS],
  );
  return rows.length;
}
