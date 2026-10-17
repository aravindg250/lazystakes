/**
 * api.ts — every call to the LazyStakes server.
 *
 * Each request carries the Supabase session token and the device's
 * timezone. The server creates the account on the first request and
 * decides everything that affects money; the app only renders the result.
 */

import { supabase } from "./supabase";
import type { CheckIn, Commitment, Weekday } from "../types";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

// ---------------------------------------------------------------
// Response shapes (mirroring server/src/api/app.ts)
// ---------------------------------------------------------------

export type PaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number };

export type BillingState =
  | { blocked: false }
  | { blocked: true; failedChargeId: string; amountCents: number; reason: string | null };

export type Me = {
  timezone: string;
  settings: { remindEnabled: boolean; finalWarningEnabled: boolean; receiptsEnabled: boolean };
  paymentMethod: PaymentMethod | null;
  billing: BillingState;
};

export type MonthSummary = { completed: number; scheduled: number; passesUsed: number };

export type TodayItem = { checkIn: CheckIn; commitment: Commitment; month: MonthSummary | null };

export type Today = { today: TodayItem[]; upcoming: TodayItem[] };

export type CommitmentStats = {
  kept: number;
  missed: number;
  excused: number;
  total: number;
  paidCents: number;
  rate: number; // 0..1
};

export type CommitmentSummary = { commitment: Commitment; stats: CommitmentStats };

export type CommitmentDetail = CommitmentSummary & { history: CheckIn[] };

export type ChargeStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded";

export type Charge = {
  id: string;
  amountCents: number;
  status: ChargeStatus;
  commitmentTitle: string;
  checkIn: CheckIn;
};

// ---------------------------------------------------------------
// Transport
// ---------------------------------------------------------------

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_URL isn't set");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "unauthenticated", "Sign in to continue");

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-timezone": deviceTimezone(),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Couldn't reach LazyStakes. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error ?? {};
    // The session is no good (expired beyond refresh, or the account is
    // gone): sign out so the app returns to the sign-in screen.
    if (res.status === 401) await supabase.auth.signOut().catch(() => {});
    throw new ApiError(res.status, err.code ?? "error", err.message ?? "Something went wrong");
  }
  return json as T;
}

// ---------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------

export const api = {
  me: () => request<Me>("GET", "/v1/me"),
  updateMe: (patch: Partial<Me["settings"]> & { timezone?: string; expoPushToken?: string | null }) =>
    request<void>("PATCH", "/v1/me", patch),

  today: () => request<Today>("GET", "/v1/today"),

  commitments: () => request<CommitmentSummary[]>("GET", "/v1/commitments"),
  commitment: (id: string) => request<CommitmentDetail>("GET", `/v1/commitments/${id}`),
  createCommitment: (input: { title: string; scheduleDays: Weekday[]; stakeCents: number; consentText: string }) =>
    request<Commitment>("POST", "/v1/commitments", input),
  pause: (id: string) => request<Commitment>("POST", `/v1/commitments/${id}/pause`),
  resume: (id: string) => request<Commitment>("POST", `/v1/commitments/${id}/resume`),
  remove: (id: string) => request<void>("DELETE", `/v1/commitments/${id}`),

  markDone: (checkInId: string) => request<CheckIn>("POST", `/v1/check-ins/${checkInId}/done`),
  undo: (checkInId: string) => request<CheckIn>("POST", `/v1/check-ins/${checkInId}/undo`),

  charges: () => request<Charge[]>("GET", "/v1/charges"),
};

/** Stripe sends lowercase brands ("visa", "amex"). */
export function cardBrand(pm: PaymentMethod): string {
  return `${pm.brand.charAt(0).toUpperCase()}${pm.brand.slice(1)}`;
}

/** "Visa 4242", or a fallback when there's no card yet. */
export function cardLabel(pm: PaymentMethod | null | undefined, fallback = "No card yet"): string {
  return pm ? `${cardBrand(pm)} ${pm.last4}` : fallback;
}
