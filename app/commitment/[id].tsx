/**
 * app/commitment/[id].tsx — one commitment in full.
 *
 * Dynamic route. Expo Router resolves static siblings first, so /new and
 * /confirm still reach their own files rather than landing here.
 *
 * Layout order is deliberate: identity first (what did I sign up for),
 * then performance (how am I doing), then history (what actually happened),
 * then the dangerous buttons last, where they can't be hit by accident.
 */

import React from "react";
import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  Screen, Card, Body, Caption, Button, StakeBlock, Gap, styles,
} from "../../src/components/primitives";
import { DetailSkeleton, ErrorState } from "../../src/components/states";
import { DevFooter } from "../../src/dev/DevPanel";
import { useMockQuery } from "../../src/dev/DevTools";
import { haptics } from "../../src/lib/haptics";
import { ScreenHeader, BackButton } from "../../src/components/chrome";
import { DayStrip, StatRow, HistoryRow } from "../../src/components/commitment";
import { useTheme, space } from "../../src/theme";
import { formatSchedule } from "../../src/types";
import {
  mockCommitments, mockPaymentMethod, historyFor, statsFor, groupByMonth,
} from "../../src/mock/data";

export default function CommitmentDetailScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useMockQuery(() => mockCommitments.find((cm) => cm.id === id) ?? null);

  if (query.status !== "ready") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <Screen>
          <ScreenHeader title="Commitment" left={<BackButton />} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: space.xxxl }}
          >
            {query.status === "loading"
              ? <DetailSkeleton />
              : <ErrorState onRetry={query.retry} />}
            <DevFooter />
          </ScrollView>
        </Screen>
      </SafeAreaView>
    );
  }

  const commitment = query.data;

  if (!commitment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <Screen>
          <ScreenHeader title="Not found" left={<BackButton />} />
          <Body tone="secondary">That commitment no longer exists.</Body>
        </Screen>
      </SafeAreaView>
    );
  }

  const stats = statsFor(commitment.id);
  const months = groupByMonth(historyFor(commitment.id));
  const paused = commitment.status === "paused";

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert(
      "Delete commitment?",
      "Your history stays and nothing new will be scheduled. If today is due, it still counts.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => router.back() },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader
          title={commitment.title}
          eyebrow={paused ? "Paused" : "Active"}
          left={<BackButton />}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <Card>
            <StakeBlock
              state={paused ? "idle" : "pending"}
              amountCents={commitment.stakeCents}
              labelOverride="Per missed day"
            />
            <Gap size={space.lg} />
            <DayStrip days={commitment.scheduleDays} />
            <Gap size={space.md} />
            <Caption>{formatSchedule(commitment.scheduleDays)} · due by 11:59 pm</Caption>
          </Card>

          <Gap size={space.xl} />

          <Caption>Since {new Date(commitment.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Caption>
          <Gap size={space.sm} />
          <StatRow stats={stats} />

          <Gap size={space.xl} />

          <Card>
            <DetailRow label="Proof" value="Honor system" first />
            <DetailRow label="Free passes" value={`${commitment.freePassesPerMonth} per month`} />
            <DetailRow label="Card" value={`${mockPaymentMethod.brand} ${mockPaymentMethod.last4}`} />
          </Card>

          <Gap size={space.xl} />

          {months.length === 0 && (
            <Card>
              <Body tone="secondary">
                No history yet. Each scheduled day shows up here once it has passed.
              </Body>
            </Card>
          )}

          {months.map((group, gi) => (
            <View key={group.label}>
              {gi > 0 && <Gap size={space.lg} />}
              <Caption>{group.label}</Caption>
              <Gap size={space.sm} />
              <Card padding={0} style={{ paddingHorizontal: space.lg }}>
                {group.items.map((ci, i) => (
                  <HistoryRow
                    key={ci.id}
                    checkIn={ci}
                    showDivider={i < group.items.length - 1}
                  />
                ))}
              </Card>
            </View>
          ))}

          <Gap size={space.xxl} />

          <Button
            label={paused ? "Resume commitment" : "Pause commitment"}
            onPress={() => {}}
          />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            {paused
              ? "Resuming starts from your next scheduled day."
              : "Pausing takes effect on your next scheduled day, not today."}
          </Caption>

          <Gap size={space.lg} />
          <Button label="Delete commitment" variant="ghost" onPress={confirmDelete} />

          <DevFooter />
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}

function DetailRow({
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
      <Body numberOfLines={1}>{value}</Body>
    </View>
  );
}
