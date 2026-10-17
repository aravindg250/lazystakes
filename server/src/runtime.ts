/**
 * runtime.ts — builds real dependencies from the environment. Shared by the
 * server entry point and the scripts.
 */

import Stripe from "stripe";

import { loadConfig, type Config } from "./config";
import { createPgDb } from "./db";
import type { Deps } from "./deps";
import { createStripeGateway, type ChargeGateway } from "./gateways/stripe";
import { createExpoPushGateway } from "./gateways/push";

export function createRuntime(): { config: Config; deps: Deps; stripe: Stripe | null } {
  const config = loadConfig();
  const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

  // Without a Stripe key the server still runs (useful before the account
  // exists); charges simply fail with a clear reason and retry later.
  const noStripe: ChargeGateway = {
    charge: async () => ({
      ok: false, paymentIntentId: null, code: "stripe_not_configured", message: "STRIPE_SECRET_KEY is not set",
    }),
  };

  const deps: Deps = {
    db: createPgDb(config.databaseUrl),
    now: () => new Date(),
    charges: stripe ? createStripeGateway(stripe) : noStripe,
    push: createExpoPushGateway(),
    notificationsEnabled: config.notificationsEnabled,
    devAuth: config.devAuth,
  };

  return { config, deps, stripe };
}
