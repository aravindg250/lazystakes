/**
 * DevTools.tsx — build-time affordances for working against mock data.
 *
 * Two things live here:
 *
 *   SHOW_DEV_TOOLS  — whether preview controls render at all. Driven by
 *                     EXPO_PUBLIC_SHOW_DEV_TOOLS; when unset, follows __DEV__
 *                     so a production build hides them without any config.
 *
 *   useMockQuery    — the shape every data-loading screen will have once the
 *                     backend exists: { status, data, retry }. Today it
 *                     returns mock data, or a simulated loading/error state
 *                     chosen from the dev controls. Phase 3 replaces the body
 *                     of this hook with real API calls and the screens don't
 *                     change.
 */

import React, { createContext, useContext, useMemo, useState } from "react";

const flag = process.env.EXPO_PUBLIC_SHOW_DEV_TOOLS;
export const SHOW_DEV_TOOLS = flag === undefined ? __DEV__ : flag === "true";

export type DataState = "ready" | "loading" | "error";

type DevContextValue = {
  dataState: DataState;
  setDataState: (s: DataState) => void;
};

const DevContext = createContext<DevContextValue | null>(null);

export function DevProvider({ children }: { children: React.ReactNode }) {
  const [dataState, setDataState] = useState<DataState>("ready");
  const value = useMemo(() => ({ dataState, setDataState }), [dataState]);
  return <DevContext.Provider value={value}>{children}</DevContext.Provider>;
}

export function useDev(): DevContextValue {
  const ctx = useContext(DevContext);
  if (!ctx) throw new Error("useDev must be used inside <DevProvider>. Check app/_layout.tsx.");
  return ctx;
}

export type QueryResult<T> =
  | { status: "loading"; data: null; retry: () => void }
  | { status: "error"; data: null; retry: () => void }
  | { status: "ready"; data: T; retry: () => void };

export function useMockQuery<T>(get: () => T): QueryResult<T> {
  const { dataState, setDataState } = useDev();
  // Retrying a simulated error "succeeds", so the recovery path can be
  // previewed end to end.
  const retry = () => setDataState("ready");

  if (dataState === "loading") return { status: "loading", data: null, retry };
  if (dataState === "error") return { status: "error", data: null, retry };
  return { status: "ready", data: get(), retry };
}
