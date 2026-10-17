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
 *
 * Shown once per account per device, right after the first sign-in.
 * Finishing (or skipping) flips the route guard in app/_layout.tsx, which
 * moves to Today on its own.
 */

import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import {
  Screen, Title, Body, Button, Card, Gap, StakeBlock,
} from "../src/components/primitives";
import { useTheme, space, radius } from "../src/theme";
import { formatMoney, MAX_STAKE_CENTS } from "../src/types";
import { useAuth } from "../src/lib/auth";

const CAP = formatMoney(MAX_STAKE_CENTS, false);

type Step = {
  title: string;
  body: string;
  points: { icon: React.ComponentProps<typeof Feather>["name"]; text: string }[];
};

const STEPS: Step[] = [
  {
    title: "You set the stakes",
    body: `Pick what you keep putting off, the days you'll do it, and how much a miss costs you. Anywhere from $1 to ${CAP}.`,
    points: [
      { icon: "calendar", text: "The gym, the grocery run, that email — Monday, Wednesday, Friday, whatever fits" },
      { icon: "dollar-sign", text: "Set what a miss costs. Raise it later if it stops stinging" },
      { icon: "clock", text: "Every day runs until 11:59 pm your time" },
    ],
  },
  {
    title: "You mark it done",
    body: "When you've done it, hold Mark done on the Today screen. No photos, no forms — it's on your honor.",
    points: [
      { icon: "check-circle", text: "Mark it done before 11:59 pm. It has to reach us in time, so don't leave it to the last second" },
      { icon: "rotate-ccw", text: "Marked it by mistake? Undo any time before the deadline" },
      { icon: "bell", text: "You'll get a nudge at 6 pm and a final warning at 10 pm" },
    ],
  },
  {
    title: "There are limits",
    body: "This is meant to motivate you, not to punish you for having a bad week.",
    points: [
      { icon: "shield", text: "One free pass a month, applied automatically" },
      { icon: "trending-up", text: `Stakes cap at ${CAP} per miss` },
      { icon: "pause-circle", text: "Pause or delete a commitment any time" },
    ],
  },
];

export default function OnboardingScreen() {
  const { c } = useTheme();
  const { finishOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const next = () => {
    if (last) finishOnboarding();
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
              <Button label="Skip" variant="ghost" onPress={finishOnboarding} />
            </>
          )}
        </View>
      </Screen>
    </SafeAreaView>
  );
}
