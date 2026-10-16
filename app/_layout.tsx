import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";

import { ThemeProvider, useTheme } from "../src/theme";
import { DevProvider } from "../src/dev/DevTools";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    // Hide on error too — a missing font shouldn't strand users on a splash
    // screen. React Native falls back to the system face.
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <DevProvider>
        <ThemedStack />
      </DevProvider>
    </ThemeProvider>
  );
}

/**
 * Split out because useTheme has to be called beneath the provider, and the
 * status bar plus navigator background both need the resolved palette.
 */
function ThemedStack() {
  const { c, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}
