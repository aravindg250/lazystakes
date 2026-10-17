/**
 * query.ts — load data from the API for a screen.
 *
 *   const query = useQuery(api.today);
 *
 * The fetcher must be stable: a module-level function, or wrapped in
 * useCallback when it depends on a param.
 *
 * Returns { status, data, retry, refresh, setData }. Loads when the screen
 * gains focus, so coming back to a screen always shows the server's
 * current state, and keeps showing the last data while it reloads instead
 * of flashing a skeleton.
 *
 * The dev "Simulate data" pills (src/dev) still force loading or error.
 */

import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useDev } from "../dev/DevTools";

export type QueryResult<T> =
  | { status: "loading"; data: null }
  | { status: "error"; data: null; error: Error }
  | { status: "ready"; data: T };

export type Query<T> = QueryResult<T> & {
  /** Reload after an error. */
  retry: () => void;
  /** Reload in the background, e.g. after a change. */
  refresh: () => Promise<void>;
  /** Replace the data locally with what a mutation returned. */
  setData: (update: (prev: T) => T) => void;
};

export function useQuery<T>(fetcher: () => Promise<T>): Query<T> {
  const { dataState, setDataState } = useDev();
  const [state, setState] = useState<QueryResult<T>>({ status: "loading", data: null });
  // Ignore responses that arrive after a newer request started.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await fetcher();
      if (id === latest.current) setState({ status: "ready", data });
    } catch (e) {
      if (id !== latest.current) return;
      // Keep showing data we already have; only an empty screen shows the error.
      setState((prev) => (prev.status === "ready" ? prev : { status: "error", data: null, error: e as Error }));
    }
  }, [fetcher]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const retry = useCallback(() => {
    if (dataState !== "ready") { setDataState("ready"); return; }
    setState({ status: "loading", data: null });
    refresh();
  }, [dataState, setDataState, refresh]);

  const setData = useCallback((update: (prev: T) => T) => {
    setState((prev) => (prev.status === "ready" ? { status: "ready", data: update(prev.data) } : prev));
  }, []);

  const shown: QueryResult<T> =
    dataState === "loading" ? { status: "loading", data: null }
    : dataState === "error" ? { status: "error", data: null, error: new Error("Simulated") }
    : state;

  return { ...shown, retry, refresh, setData };
}
