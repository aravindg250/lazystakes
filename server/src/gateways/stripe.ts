/**
 * stripe.ts — the only code that moves money.
 *
 * Double-charging someone for one missed day would be fatal to a product
 * whose premise is that the charging is fair, so this is built around one
 * invariant: a missed check-in maps to exactly one PaymentIntent, and a
 * PaymentIntent can succeed at most once.
 *
 *   First attempt   create + confirm, idempotency key `checkin_<id>`.
 *                   A timeout-and-retry returns the original PaymentIntent
 *                   rather than creating a second one.
 *   Later attempts  re-confirm that same PaymentIntent. Never a new one —
 *                   a declined PaymentIntent can be retried, and if an
 *                   earlier attempt actually succeeded we find out by
 *                   reading it first.
 */

import Stripe from "stripe";

export type ChargeRequest = {
  chargeId: string;
  checkInId: string;
  idempotencyKey: string;
  attempt: number;
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  existingPaymentIntentId: string | null;
};

export type ChargeResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; paymentIntentId: string | null; code: string; message: string };

export interface ChargeGateway {
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

export function createStripeGateway(stripe: Stripe): ChargeGateway {
  return {
    async charge(req) {
      try {
        if (req.existingPaymentIntentId) {
          const existing = await stripe.paymentIntents.retrieve(req.existingPaymentIntentId);
          if (existing.status === "succeeded") return { ok: true, paymentIntentId: existing.id };

          const pi = await stripe.paymentIntents.confirm(
            existing.id,
            { payment_method: req.paymentMethodId, off_session: true },
            { idempotencyKey: `${req.idempotencyKey}_attempt_${req.attempt}` },
          );
          return pi.status === "succeeded"
            ? { ok: true, paymentIntentId: pi.id }
            : { ok: false, paymentIntentId: pi.id, code: `status_${pi.status}`, message: `PaymentIntent is ${pi.status}` };
        }

        const pi = await stripe.paymentIntents.create(
          {
            amount: req.amountCents,
            currency: req.currency,
            customer: req.customerId,
            payment_method: req.paymentMethodId,
            off_session: true,
            confirm: true,
            description: "LazyStakes missed day",
            metadata: { charge_id: req.chargeId, check_in_id: req.checkInId },
          },
          { idempotencyKey: req.idempotencyKey },
        );
        return pi.status === "succeeded"
          ? { ok: true, paymentIntentId: pi.id }
          : { ok: false, paymentIntentId: pi.id, code: `status_${pi.status}`, message: `PaymentIntent is ${pi.status}` };
      } catch (err) {
        if (err instanceof Stripe.errors.StripeError) {
          return {
            ok: false,
            // Card declines still create a PaymentIntent; keep its id so the
            // next attempt re-confirms it instead of creating another.
            paymentIntentId: err.payment_intent?.id ?? null,
            code: err.decline_code ?? err.code ?? err.type,
            message: err.message,
          };
        }
        throw err;
      }
    },
  };
}
