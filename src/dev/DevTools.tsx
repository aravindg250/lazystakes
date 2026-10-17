/**
 * DevTools.tsx — preview controls for development builds.
 *
 *   SHOW_DEV_TOOLS  — whether preview controls render at all. Driven by
 *                     EXPO_PUBLIC_SHOW_DEV_TOOLS; when unset, follows __DEV__
 *                     so a production build hides them without any config.
 *
 *   dataState       — forces every screen that loads with useQuery
 *                     (src/lib/query.ts) into its loading or error state,
 *                     so those states can be checked without breaking the
 *                     network.
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
