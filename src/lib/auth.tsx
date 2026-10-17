/**
 * auth.tsx — who's signed in, and the email-code sign-in flow.
 *
 * v1 signs in with a one-time code sent by email (Supabase Auth). Sign in
 * with Apple joins it once there's a paid Apple Developer account; the
 * server doesn't care which one was used, only that Supabase signed the
 * session.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase";
import { api, deviceTimezone } from "./api";

type AuthValue = {
  /** Still reading the saved session; keep the splash screen up. */
  loading: boolean;
  session: Session | null;
  /** Whether this account has finished onboarding on this device. */
  onboarded: boolean;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  finishOnboarding: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const onboardedKey = (userId: string) => `lazystakes.onboarded.${userId}`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // Keyed by user, so a stale answer for the previous account never leaks.
  const [onboardedFor, setOnboardedFor] = useState<{ userId: string; done: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(onboardedKey(userId))
      .catch(() => null)
      .then((v) => { if (!cancelled) setOnboardedFor({ userId, done: v === "1" }); });

    // New commitments use the account's timezone, so keep it matching the
    // phone. Existing commitments keep theirs; travel never moves a deadline.
    api.me()
      .then((me) => (me.timezone === deviceTimezone() ? undefined : api.updateMe({ timezone: deviceTimezone() })))
      .catch(() => {});

    return () => { cancelled = true; };
  }, [userId]);

  const onboardingKnown = !userId || onboardedFor?.userId === userId;

  const value = useMemo<AuthValue>(() => ({
    loading: !sessionLoaded || !onboardingKnown,
    session,
    onboarded: Boolean(userId && onboardedFor?.userId === userId && onboardedFor.done),

    sendCode: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
    },

    verifyCode: async (email, code) => {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
    },

    finishOnboarding: () => {
      if (!userId) return;
      setOnboardedFor({ userId, done: true });
      AsyncStorage.setItem(onboardedKey(userId), "1").catch(() => {});
    },

    signOut: async () => {
      await supabase.auth.signOut();
    },
  }), [session, sessionLoaded, onboardingKnown, onboardedFor, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>. Check app/_layout.tsx.");
  return ctx;
}
