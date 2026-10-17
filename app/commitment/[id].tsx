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

import React, { useCallback, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  Screen, Card, Body, Caption, Button, StakeBlock, Gap, styles,
} from "../../src/components/primitives";
import { DetailSkeleton, ErrorState } from "../../src/components/states";
import { DevFooter } from "../../src/dev/DevPanel";
import { useQuery } from "../../src/lib/query";
import { api, cardLabel, ApiError } from "../../src/lib/api";
import { groupByMonth } from "../../src/lib/history";
import { haptics } from "../../src/lib/haptics";
import { ScreenHeader, BackButton } from "../../src/components/chrome";
import { DayStrip, StatRow, HistoryRow } from "../../src/components/commitment";
import { useTheme, space } from "../../src/theme";
import { formatSchedule } from "../../src/types";

export default function CommitmentDetailScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Not found comes back as a 404; show that as its own state, not an error.
  const load = useCallback(async () => {
    try {
      const [detail, me] = await Promise.all([api.commitment(id), api.me()]);
      return { detail, me };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [id]);
  const query = useQuery(load);
  const [busy, setBusy] = useState(false);

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

  if (!query.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <Screen>
          <ScreenHeader title="Not found" left={<BackButton />} />
          <Body tone="secondary">That commitment no longer exists.</Body>
        </Screen>
      </SafeAreaView>
    );
  }

  const { detail, me } = query.data;
  const { commitment, stats } = detail;
  const months = groupByMonth(detail.history);
  const paused = commitment.status === "paused";

  const act = async (fn: () => Promise<unknown>, title: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      haptics.success();
      if (after) after();
      else await query.refresh();
    } catch (e) {
      haptics.warning();
      Alert.alert(title, e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => act(
    () => (paused ? api.resume(commitment.id) : api.pause(commitment.id)),
    paused ? "Couldn't resume" : "Couldn't pause",
  );

  const confirmDelete = () => {
    haptics.warning();
    Alert.alert(
      "Delete commitment?",
      "Your history stays and nothing new will be scheduled. If today is due, it still counts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => act(() => api.remove(commitment.id), "Couldn't delete", () => router.back()),
        },
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
            <DetailRow label="Card" value={cardLabel(me.paymentMethod)} />
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
            disabled={busy}
            onPress={togglePause}
          />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            {paused
              ? "Resuming starts tomorrow at the earliest, never today."
              : "Pausing takes effect after today. If today is due, it still counts."}
          </Caption>

          <Gap size={space.lg} />
          <Button label="Delete commitment" variant="ghost" disabled={busy} onPress={confirmDelete} />

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
