/**
 * app/settings.tsx
 *
 * Ordered by how often people actually come here: appearance and
 * notifications near the top, account and legal at the bottom, sign out
 * last where it can't be hit by accident.
 *
 * The notification toggles carry a warning rather than being silently
 * disableable. Turning off the final warning is a legitimate choice, but
 * "I was never told" is the most common opening line of a chargeback, so
 * the consequence gets stated at the point of the decision.
 */

import React, { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Caption, Gap, Segmented } from "../src/components/primitives";
import { ScreenHeader, BackButton } from "../src/components/chrome";
import { Section, SettingsRow, ToggleRow, InfoRow, CustomRow } from "../src/components/settings";
import { DataStatePills } from "../src/dev/DevPanel";
import { SHOW_DEV_TOOLS } from "../src/dev/DevTools";
import { useTheme, space, type ThemeMode } from "../src/theme";
import { mockPaymentMethod, mockAccount } from "../src/mock/data";

export default function SettingsScreen() {
  const { c, mode, setMode } = useTheme();
  const router = useRouter();

  const [remind6pm, setRemind6pm] = useState(true);
  const [warn10pm, setWarn10pm] = useState(true);
  const [receipts, setReceipts] = useState(true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader title="Settings" left={<BackButton />} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <Section label="Appearance">
            <CustomRow divider={false}>
              <Segmented<ThemeMode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </CustomRow>
          </Section>

          <Gap size={space.xl} />

          <Section label="Payment">
            <SettingsRow
              label="Card"
              value={`${mockPaymentMethod.brand} ${mockPaymentMethod.last4}`}
              onPress={() => router.push("/payment")}
            />
            <SettingsRow
              label="Charge history"
              onPress={() => router.push("/payment")}
              divider={false}
            />
          </Section>

          <Gap size={space.xl} />

          <Section
            label="Reminders"
            footnote="Reminders are how you avoid being charged by accident. Turning them off doesn't change your commitments."
          >
            <ToggleRow
              label="Evening reminder"
              hint="6 pm on days you have something due"
              value={remind6pm}
              onChange={setRemind6pm}
            />
            <ToggleRow
              label="Final warning"
              hint="10 pm, only if the day isn't marked done yet"
              value={warn10pm}
              onChange={setWarn10pm}
            />
            <ToggleRow
              label="Charge receipts"
              hint="A notification whenever you're charged"
              value={receipts}
              onChange={setReceipts}
              divider={false}
            />
          </Section>

          <Gap size={space.xl} />

          <Section label="Account">
            <InfoRow label="Signed in as" value={mockAccount.email} />
            <InfoRow label="Member since" value={mockAccount.memberSince} />
            <SettingsRow label="Time zone" value="America/New York" />
            <SettingsRow label="Export my data" divider={false} />
          </Section>

          <Gap size={space.xl} />

          <Section label="Legal">
            <SettingsRow label="Terms of service" />
            <SettingsRow label="Privacy policy" />
            <SettingsRow label="Contact support" divider={false} />
          </Section>

          <Gap size={space.xl} />

          <Section>
            <SettingsRow label="Sign out" onPress={() => router.replace("/sign-in")} divider={false} />
          </Section>

          <Gap size={space.xl} />

          {SHOW_DEV_TOOLS && (
            <>
              <Caption>Preview screens</Caption>
              <Gap size={space.sm} />
              <Section>
                <SettingsRow label="Sign in" onPress={() => router.push("/sign-in")} />
                <SettingsRow label="Onboarding" onPress={() => router.push("/onboarding")} divider={false} />
              </Section>
              <Gap size={space.lg} />
              <DataStatePills />
              <Gap size={space.lg} />
            </>
          )}

          <Caption style={{ textAlign: "center" }}>Version 0.1.0</Caption>
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}
