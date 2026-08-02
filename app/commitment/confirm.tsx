/**
 * app/commitment/confirm.tsx — restate the deal, then take consent.
 *
 * This screen exists for two reasons.
 *
 * The product reason: a commitment you skimmed past isn't a commitment.
 * Restating it in plain money makes the decision deliberate.
 *
 * The business reason: this is the moment you capture a consent record.
 * You're charging people for failing, which is the most disputable
 * transaction type there is. When someone files a chargeback, what you send
 * the processor is this exact language plus a timestamp. The wording is
 * therefore load-bearing — it names the amount, the trigger, and the card.
 */

import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  Screen, Card, Body, Caption, Button, StakeBlock, Gap, Hairline, styles,
} from "../../src/components/primitives";
import { ScreenHeader, BackButton } from "../../src/components/chrome";
import { useTheme, space, radius } from "../../src/theme";
import { formatMoney, formatSchedule, type Weekday } from "../../src/types";

export default function ConfirmCommitmentScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title: string; days: string; stakeCents: string; venueName: string;
  }>();

  const [agreed, setAgreed] = useState(false);

  const title = params.title ?? "Go to the gym";
  const days = (params.days ?? "").split(",").filter(Boolean).map(Number) as Weekday[];
  const stakeCents = Number(params.stakeCents ?? 500);
  const venueName = params.venueName || null;

  const consentText =
    `I authorise Gymstakes to charge ${formatMoney(stakeCents)} to my card ` +
    `each ${formatSchedule(days).toLowerCase()} that I don't verify "${title}" by 11:59 pm.`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader title="Confirm" left={<BackButton />} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <Card>
            <Caption>{formatSchedule(days)}</Caption>
            <Gap size={space.xs} />
            <Body>{title}</Body>
            <Gap size={space.lg} />
            <StakeBlock
              state="pending"
              amountCents={stakeCents}
              labelOverride="Per missed day"
            />
          </Card>

          <Gap size={space.xl} />

          <Card>
            <SummaryRow label="Days per week" value={String(days.length)} first />
            <SummaryRow label="Deadline" value="11:59 pm" />
            <SummaryRow label="Free passes" value="1 per month" />
            {venueName ? <SummaryRow label="Gym" value={venueName} /> : null}
            <SummaryRow label="Card" value="Visa 4242" />
          </Card>

          <Gap size={space.xl} />

          <Caption>What you're agreeing to</Caption>
          <Gap size={space.sm} />
          <Card>
            <Body tone="secondary">{consentText}</Body>
            <Gap size={space.md} />
            <Body tone="secondary">
              Charges happen automatically at the deadline. You'll get a reminder
              at 6 pm and a final warning at 10 pm on every day that's due.
            </Body>
            <Gap size={space.md} />
            <Hairline />
            <Gap size={space.md} />
            <Body tone="secondary">
              You can pause or delete this commitment at any time. Pausing takes
              effect on the next scheduled day, not today.
            </Body>
          </Card>

          <Gap size={space.lg} />

          <ConsentCheckbox checked={agreed} onToggle={() => setAgreed((v) => !v)} />

          <Gap size={space.xl} />

          <Button
            label="Create commitment"
            variant="primary"
            disabled={!agreed}
            onPress={() => router.replace("/")}
          />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            Your first charge can't happen before tomorrow.
          </Caption>
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}

function SummaryRow({
  label, value, first = false,
}: { label: string; value: string; first?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{
      borderTopWidth: first ? 0 : 1,
      borderTopColor: c.hairline,
      paddingVertical: space.md,
      ...styles.rowBetween,
    }}>
      <Caption>{label}</Caption>
      <Body>{value}</Body>
    </View>
  );
}

/**
 * An explicit tap, not a pre-ticked box. Pre-checking consent is both a
 * dark pattern and worthless as evidence in a dispute.
 */
function ConsentCheckbox({
  checked, onToggle,
}: { checked: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.control,
        backgroundColor: checked ? c.accentSoft : c.surfaceSunken,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{
        width: 22, height: 22,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: checked ? c.accent : "transparent",
        borderWidth: checked ? 0 : 1.5,
        borderColor: c.hairlineStrong,
      }}>
        {checked && <Feather name="check" size={14} color={c.onAccent} />}
      </View>
      <Body style={{ flex: 1 }} tone={checked ? "accent" : "secondary"}>
        I understand I'll be charged when I miss a day.
      </Body>
    </Pressable>
  );
}
