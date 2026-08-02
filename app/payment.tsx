/**
 * app/payment.tsx
 *
 * Two jobs: show which card gets charged, and show every charge that's
 * happened. The second one is not optional. People dispute charges they
 * can't find a record of, and an in-app history that matches their bank
 * statement resolves most complaints before they reach Stripe.
 *
 * There is no card form here on purpose. In the real build this screen
 * hands off to Stripe's PaymentSheet, which collects card details inside
 * Stripe's own UI — raw card numbers never touch your app or your server,
 * which is what keeps you out of PCI scope.
 */

import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  Screen, Card, Body, Caption, Button, MoneySm, Gap, StakeBlock, styles,
} from "../src/components/primitives";
import { ScreenHeader, BackButton } from "../src/components/chrome";
import { Section, InfoRow } from "../src/components/settings";
import { useTheme, space, radius, hairline } from "../src/theme";
import { formatMoney } from "../src/types";
import { mockPaymentMethod, allCharges } from "../src/mock/data";

export default function PaymentScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const charges = allCharges();
  const totalCents = charges.reduce((sum, x) => sum + x.checkIn.stakeCents, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader title="Payment" left={<BackButton />} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View style={{
                width: 44, height: 32,
                borderRadius: 6,
                backgroundColor: c.surfaceSunken,
                alignItems: "center", justifyContent: "center",
              }}>
                <Feather name="credit-card" size={16} color={c.textSecondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body>{mockPaymentMethod.brand} ending {mockPaymentMethod.last4}</Body>
                <Caption>
                  Expires {String(mockPaymentMethod.expMonth).padStart(2, "0")}/{mockPaymentMethod.expYear}
                </Caption>
              </View>
            </View>

            <Gap size={space.lg} />
            <Button label="Change card" onPress={() => {}} />
          </Card>

          <Gap size={space.md} />
          <Caption>
            Card details are handled by Stripe and never stored on your device or ours.
          </Caption>

          <Gap size={space.xl} />

          <StakeBlock
            state="charged"
            amountCents={totalCents}
            labelOverride="Paid in missed days, all time"
          />

          <Gap size={space.xl} />

          {charges.length === 0 ? (
            <Card>
              <Body>No charges yet</Body>
              <Gap size={space.sm} />
              <Body tone="secondary">
                You haven't missed a day. Charges show up here with the date and
                the commitment they came from.
              </Body>
            </Card>
          ) : (
            <>
              <Caption>Charge history</Caption>
              <Gap size={space.sm} />
              <Card padding={0} style={{ paddingHorizontal: space.lg }}>
                {charges.map((x, i) => (
                  <ChargeRow
                    key={x.checkIn.id}
                    title={x.commitmentTitle}
                    dateLabel={new Date(x.checkIn.deadlineAt).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                    amountCents={x.checkIn.stakeCents}
                    showDivider={i < charges.length - 1}
                  />
                ))}
              </Card>
            </>
          )}

          <Gap size={space.xl} />

          <Section
            label="Billing"
            footnote="Charges appear on your statement as GYMSTAKES. If something looks wrong, contact support before disputing it with your bank — we can usually sort it out same day."
          >
            <InfoRow label="Descriptor" value="GYMSTAKES" />
            <InfoRow label="Currency" value="USD" divider={false} />
          </Section>
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}

function ChargeRow({
  title, dateLabel, amountCents, showDivider,
}: {
  title: string;
  dateLabel: string;
  amountCents: number;
  showDivider: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{
      ...styles.rowBetween,
      paddingVertical: space.md,
      gap: space.md,
      borderBottomWidth: showDivider ? hairline : 0,
      borderBottomColor: c.hairline,
    }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body numberOfLines={1}>{title}</Body>
        <Caption>{dateLabel}</Caption>
      </View>
      <MoneySm tone="charged">−{formatMoney(amountCents, false)}</MoneySm>
    </View>
  );
}
