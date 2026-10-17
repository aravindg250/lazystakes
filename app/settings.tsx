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

import React from "react";
import { ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Caption, Gap, Segmented } from "../src/components/primitives";
import { ScreenHeader, BackButton } from "../src/components/chrome";
import { Section, SettingsRow, ToggleRow, InfoRow, CustomRow } from "../src/components/settings";
import { DataStatePills } from "../src/dev/DevPanel";
import { SHOW_DEV_TOOLS } from "../src/dev/DevTools";
import { useTheme, space, type ThemeMode } from "../src/theme";
import { useAuth } from "../src/lib/auth";
import { useQuery } from "../src/lib/query";
import { api, cardLabel, type Me } from "../src/lib/api";

type ReminderKey = keyof Me["settings"];

export default function SettingsScreen() {
  const { c, mode, setMode } = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const me = useQuery(api.me);

  const settings = me.status === "ready" ? me.data.settings : null;

  // Flip immediately, save in the background, and put it back if the save fails.
  const toggle = (key: ReminderKey) => async (value: boolean) => {
    me.setData((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
    try {
      await api.updateMe({ [key]: value });
    } catch {
      me.setData((d) => ({ ...d, settings: { ...d.settings, [key]: !value } }));
      Alert.alert("Couldn't save that", "Check your connection and try again.");
    }
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "Your commitments keep running while you're signed out.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { signOut(); } },
    ]);
  };

  const memberSince = session
    ? new Date(session.user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";

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
              value={me.status === "ready" ? cardLabel(me.data.paymentMethod) : ""}
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
              value={settings?.remindEnabled ?? true}
              onChange={toggle("remindEnabled")}
            />
            <ToggleRow
              label="Final warning"
              hint="10 pm, only if the day isn't marked done yet"
              value={settings?.finalWarningEnabled ?? true}
              onChange={toggle("finalWarningEnabled")}
            />
            <ToggleRow
              label="Charge receipts"
              hint="A notification whenever you're charged"
              value={settings?.receiptsEnabled ?? true}
              onChange={toggle("receiptsEnabled")}
              divider={false}
            />
          </Section>

          <Gap size={space.xl} />

          <Section label="Account">
            <InfoRow label="Signed in as" value={session?.user.email ?? ""} />
            <InfoRow label="Member since" value={memberSince} />
            <InfoRow
              label="Time zone"
              value={me.status === "ready" ? me.data.timezone.replace(/_/g, " ") : ""}
            />
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
            <SettingsRow label="Sign out" onPress={confirmSignOut} divider={false} />
          </Section>

          <Gap size={space.xl} />

          {SHOW_DEV_TOOLS && (
            <>
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
