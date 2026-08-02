/**
 * app/onboarding.tsx
 *
 * Three steps, and each one exists to prevent a specific support ticket:
 *   1. how the money works      → "why was I charged?"
 *   2. how proof works          → "I went and it still charged me"
 *   3. what the limits are      → "I want a refund, I was sick"
 *
 * The third screen is the one people skip and the one that matters most.
 * Stating the cap and the free passes before anyone commits is what turns
 * an angry chargeback into a shrug.
 */

import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  Screen, Title, Body, Caption, Button, Card, Gap, StakeBlock,
} from "../src/components/primitives";
import { useTheme, space, radius } from "../src/theme";

type Step = {
  title: string;
  body: string;
  points: { icon: React.ComponentProps<typeof Feather>["name"]; text: string }[];
};

const STEPS: Step[] = [
  {
    title: "You set the stakes",
    body: "Choose the days you're committing to and how much a miss costs you. Anywhere from $1 to $50.",
    points: [
      { icon: "calendar", text: "Pick your days — Monday, Wednesday, Friday, whatever fits" },
      { icon: "dollar-sign", text: "Set what a miss costs. Raise it later if it stops stinging" },
      { icon: "clock", text: "Every day runs until 11:59 pm your time" },
    ],
  },
  {
    title: "Your watch does the proving",
    body: "A logged workout verifies the day automatically. No photos, no forms, nothing to remember.",
    points: [
      { icon: "activity", text: "Apple Watch and iPhone workouts verify on their own" },
      { icon: "maximize", text: "Scan the QR code at your gym as a manual backup" },
      { icon: "bell", text: "You'll get a nudge at 6 pm and a final warning at 10 pm" },
    ],
  },
  {
    title: "There are limits",
    body: "This is meant to motivate you, not to punish you for having a bad week.",
    points: [
      { icon: "shield", text: "One free pass a month, applied automatically" },
      { icon: "trending-up", text: "Stakes cap at $50 per miss" },
      { icon: "pause-circle", text: "Pause or delete a commitment any time" },
    ],
  },
];

export default function OnboardingScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const next = () => {
    if (last) router.replace("/");
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      <Screen>
        <View style={{ flexDirection: "row", gap: space.xs, paddingTop: space.lg }}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: radius.pill,
                backgroundColor: i <= step ? c.accent : c.surfaceSunken,
              }}
            />
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: space.xxl }}
        >
          {step === 0 && (
            <>
              <StakeBlock state="pending" amountCents={500} labelOverride="Per missed day" />
              <Gap size={space.xxl} />
            </>
          )}

          <Title>{current.title}</Title>
          <Gap size={space.md} />
          <Body tone="secondary">{current.body}</Body>

          <Gap size={space.xl} />

          <Card>
            {current.points.map((p, i) => (
              <View key={p.text}>
                {i > 0 && <Gap size={space.lg} />}
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
                  <View style={{
                    width: 30, height: 30,
                    borderRadius: radius.pill,
                    backgroundColor: c.accentSoft,
                    alignItems: "center", justifyContent: "center",
                    marginTop: 1,
                  }}>
                    <Feather name={p.icon} size={15} color={c.accentText} />
                  </View>
                  <Body tone="secondary" style={{ flex: 1 }}>{p.text}</Body>
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>

        <View style={{ paddingBottom: space.lg }}>
          <Button label={last ? "Get started" : "Continue"} variant="primary" onPress={next} />
          {!last && (
            <>
              <Gap size={space.sm} />
              <Button label="Skip" variant="ghost" onPress={() => router.replace("/")} />
            </>
          )}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
