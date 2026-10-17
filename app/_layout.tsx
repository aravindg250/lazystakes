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
import { AuthProvider, useAuth } from "../src/lib/auth";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  // A missing font shouldn't strand users on the splash screen either;
  // React Native falls back to the system face.
  const fontsDone = loaded || Boolean(error);

  return (
    <ThemeProvider>
      <DevProvider>
        <AuthProvider>
          {fontsDone ? <ThemedStack /> : null}
        </AuthProvider>
      </DevProvider>
    </ThemeProvider>
  );
}

/**
 * Split out because useTheme and useAuth have to be called beneath their
 * providers, and the status bar plus navigator background both need the
 * resolved palette.
 *
 * Which screens exist depends on who's signed in. When a guard flips (sign
 * in, finish onboarding, sign out), Expo Router moves to the first screen
 * that's allowed, so no screen has to navigate there itself.
 */
function ThemedStack() {
  const { c, isDark } = useTheme();
  const { loading, session, onboarded } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  const signedIn = session !== null;

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="index" />
          <Stack.Screen name="commitments" />
          <Stack.Screen name="commitment/new" />
          <Stack.Screen name="commitment/confirm" />
          <Stack.Screen name="commitment/[id]" />
          <Stack.Screen name="payment" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
