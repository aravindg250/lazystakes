/**
 * auth.ts — checks the session token the app sends with every request.
 *
 * The app signs in with Supabase Auth (Sign in with Apple) and sends the
 * session's access token as `Authorization: Bearer <token>`. Supabase signs
 * these with an asymmetric key and publishes the public half, so the server
 * verifies them itself: no secret to hold, no network call per request
 * (the key set is fetched once and cached).
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "anonymous" };

export interface AuthVerifier {
  verify(token: string): Promise<AuthResult>;
}

const claims = z.object({
  sub: z.uuid(),
  role: z.literal("authenticated"),
  is_anonymous: z.boolean().optional(),
});

/** Verifies tokens against any key set. Tests pass a local one. */
export function createJwtVerifier(keys: JWTVerifyGetKey, issuer: string): AuthVerifier {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience: "authenticated",
          algorithms: ["ES256", "RS256"],
          clockTolerance: 30,
        });
        const c = claims.safeParse(payload);
        if (!c.success) return { ok: false, reason: "invalid" };
        // Anonymous sign-ins are off in Supabase, but refuse them here too:
        // a stake needs a real account behind it.
        if (c.data.is_anonymous) return { ok: false, reason: "anonymous" };
        return { ok: true, userId: c.data.sub };
      } catch {
        return { ok: false, reason: "invalid" };
      }
    },
  };
}

/** The real thing: keys from the project's published key set. */
export function createSupabaseVerifier(supabaseUrl: string): AuthVerifier {
  const base = supabaseUrl.replace(/\/+$/, "");
  const keys = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  return createJwtVerifier(keys, `${base}/auth/v1`);
}
