/**
 * deps.ts — everything the jobs and API need, passed in rather than
 * imported, so tests can supply a fake clock, an in-process database, and
 * fake Stripe and push gateways.
 */

import type { Db } from "./db";
import type { ChargeGateway } from "./gateways/stripe";
import type { PushGateway } from "./gateways/push";

export type Deps = {
  db: Db;
  /** The server clock. The only notion of "now" anywhere in the system. */
  now: () => Date;
  charges: ChargeGateway;
  push: PushGateway;
  notificationsEnabled: boolean;
  devAuth: boolean;
};
