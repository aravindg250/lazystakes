/**
 * app/sign-in.tsx
 *
 * The premise gets stated on the first screen someone sees. An app that
 * charges people money should say so before they sign in, not three screens
 * later — anyone who bounces here was never going to keep a commitment
 * anyway, and burying it just produces refund requests.
 *
 * The Apple button is a mockup. In the native build it's replaced by
 * expo-apple-authentication's AppleAuthenticationButton, which can't render
 * in Expo Go. Apple requires the real component's exact styling, so don't
 * ship this stand-in.
 */

import React from "react";
import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { Screen, Title, Body, Caption, Gap, StakeBlock } from "../src/components/primitives";
import { useTheme, space, radius, type } from "../src/theme";

export default function SignInScreen() {
  const { c, isDark } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      <Screen>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Title>Put money on it.</Title>
          <Gap size={space.md} />
          <Body tone="secondary">
            Pick the days you'll show up. Miss one, and you pay what you said
            you'd pay.
          </Body>

          <Gap size={space.xxl} />
          <StakeBlock state="pending" amountCents={500} labelOverride="Per missed day" />
        </View>

        <View>
          <AppleSignInButton onPress={() => router.replace("/onboarding")} />
          <Gap size={space.md} />
          <Caption style={{ textAlign: "center" }}>
            By continuing you agree to the Terms and Privacy Policy.
          </Caption>
          <Gap size={space.lg} />
        </View>
      </Screen>
    </SafeAreaView>
  );
}

function AppleSignInButton({ onPress }: { onPress: () => void }) {
  const { isDark } = useTheme();
  const bg = isDark ? "#FFFFFF" : "#000000";
  const fg = isDark ? "#000000" : "#FFFFFF";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Apple"
      style={({ pressed }) => ({
        height: 50,
        borderRadius: radius.control,
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Feather name="smartphone" size={17} color={fg} />
      <Body style={[type.bodyMedium, { color: fg }]}>Sign in with Apple</Body>
    </Pressable>
  );
}
