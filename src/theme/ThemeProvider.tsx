/**
 * ThemeProvider.tsx
 *
 * Three modes, not two. "System" has to be the default and has to be a real
 * option people can return to — an app that ignores the OS setting feels
 * broken on iOS, but people who want to force one mode should be able to.
 *
 * The choice persists to device storage so it survives a reload. That's
 * local storage, not a backend — no server involved.
 */

import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { palettes, type Palette } from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "theme.mode";

type ThemeContextValue = {
  c: Palette;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") {
          setModeState(saved);
        }
      })
      .catch(() => {
        // A storage failure shouldn't block the app — fall back to system.
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";
    return {
      c: isDark ? palettes.dark : palettes.light,
      isDark,
      mode,
      setMode,
      ready,
    };
  }, [mode, systemScheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>. Check app/_layout.tsx.");
  }
  return ctx;
}
