/**
 * push.ts — push notifications through Expo's push service.
 *
 * Expo's service fronts APNs (and FCM) for apps built with Expo, so the
 * server needs one HTTPS call and no Apple certificates. The app registers
 * its Expo push token in a later phase; until then NOTIFICATIONS_ENABLED
 * stays false and this is never called.
 */

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushResult = { ok: true; ticketId: string | null } | { ok: false; error: string };

export interface PushGateway {
  send(msg: PushMessage): Promise<PushResult>;
}

export function createExpoPushGateway(fetchImpl: typeof fetch = fetch): PushGateway {
  return {
    async send(msg) {
      try {
        const res = await fetchImpl("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ ...msg, sound: "default" }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const json = (await res.json()) as {
          data?: { status: "ok" | "error"; id?: string; message?: string };
        };
        if (json.data?.status === "ok") return { ok: true, ticketId: json.data.id ?? null };
        return { ok: false, error: json.data?.message ?? "unknown push error" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
