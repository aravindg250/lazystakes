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
import { View, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  Screen, Card, Body, Caption, Button, StakeBlock, Gap, Hairline, styles,
} from "../../src/components/primitives";
import { ScreenHeader, BackButton } from "../../src/components/chrome";
import { useTheme, space, radius } from "../../src/theme";
import { haptics } from "../../src/lib/haptics";
import { useQuery } from "../../src/lib/query";
import { api, cardLabel, ApiError } from "../../src/lib/api";
import { formatMoney, formatSchedule, type Weekday } from "../../src/types";

export default function ConfirmCommitmentScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title: string; days: string; stakeCents: string;
  }>();

  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = useQuery(api.me);

  const title = params.title ?? "Go to the gym";
  const days = (params.days ?? "").split(",").filter(Boolean).map(Number) as Weekday[];
  const stakeCents = Number(params.stakeCents ?? 500);
  const card = me.status === "ready" ? cardLabel(me.data.paymentMethod, "card on file") : "card on file";
  const noCard = me.status === "ready" && !me.data.paymentMethod;

  // Load-bearing wording: this exact string plus a timestamp is the consent
  // record sent to Stripe in a dispute. It names the amount, the trigger,
  // the schedule, and the card.
  const consentText =
    `I authorise LazyStakes to charge ${formatMoney(stakeCents)} to my ${card} ` +
    `each ${formatSchedule(days).toLowerCase()} that I don't mark "${title}" done by 11:59 pm.`;

  const create = async () => {
    setBusy(true);
    try {
      // The server stores this exact text as the consent record, and
      // refuses it if it doesn't name this stake and this title.
      await api.createCommitment({ title, scheduleDays: days, stakeCents, consentText });
      haptics.success();
      router.dismissTo("/");
    } catch (e) {
      haptics.warning();
      const blocked = e instanceof ApiError && e.code === "billing_blocked";
      Alert.alert(
        blocked ? "A charge needs fixing first" : "Couldn't create it",
        e instanceof ApiError ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

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
            <SummaryRow label="Proof" value="Honor system" />
            <SummaryRow label="Card" value={noCard ? "Not added yet" : card} />
          </Card>

          <Gap size={space.xl} />

          <Caption>{"What you're agreeing to"}</Caption>
          <Gap size={space.sm} />
          <Card>
            <Body tone="secondary">{consentText}</Body>
            <Gap size={space.md} />
            <Body tone="secondary">
              {"Charges happen automatically at the deadline. You'll get a reminder " +
                "at 6 pm and a final warning at 10 pm on every day that's due."}
            </Body>
            <Gap size={space.md} />
            <Body tone="secondary">
              {"Marking a day done is on your honor. You can undo it until 11:59 pm " +
                "that day, but not after."}
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

          <ConsentCheckbox
            checked={agreed}
            onToggle={() => { haptics.tick(); setAgreed((v) => !v); }}
          />

          <Gap size={space.xl} />

          {noCard && (
            <>
              <Caption style={{ textAlign: "center" }}>
                {"You haven't added a card yet. Missed days can't be charged until you do."}
              </Caption>
              <Gap size={space.md} />
            </>
          )}
          <Button
            label={busy ? "Creating…" : "Create commitment"}
            variant="primary"
            disabled={!agreed || busy || me.status !== "ready"}
            onPress={create}
          />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            {"Your first charge can't happen before tomorrow."}
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
        {"I understand I'll be charged when I miss a day."}
      </Body>
    </Pressable>
  );
}
