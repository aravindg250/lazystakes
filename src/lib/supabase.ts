/**
 * supabase.ts — used for sign-in only.
 *
 * The app never reads or writes tables through Supabase (row-level
 * security gives it nothing to write). It signs in here, then sends the
 * session's access token to the LazyStakes API; see api.ts.
 *
 * Both values are public by design: the publishable key identifies the
 * project, it doesn't grant access.
 */

import "expo-sqlite/localStorage/install";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until .env has the Supabase URL and publishable key. */
export const SUPABASE_CONFIGURED = Boolean(url && key);

export const supabase = createClient(url ?? "https://not-configured.supabase.co", key ?? "not-configured", {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
