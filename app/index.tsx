/**
 * app/index.tsx — the today screen.
 *
 * Answers one question: is anything due, and have I done it?
 *
 * One card per commitment due today. Marking done and undoing go straight
 * to the server, which judges them against its own clock; the card shows
 * whatever the server says the day now is.
 */

import React, { useCallback, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Button, Gap } from "../src/components/primitives";
import { ScreenHeader, ThemeToggleButton, IconButton } from "../src/components/chrome";
import { TodayCard } from "../src/components/TodayCard";
import {
  CommitmentRow, RowGroup, RestDayCard, EmptyState,
} from "../src/components/CommitmentRow";
import { TodaySkeleton, RowsSkeleton, ErrorState } from "../src/components/states";
import { DevFooter } from "../src/dev/DevPanel";
import { useQuery } from "../src/lib/query";
import { api, cardLabel, ApiError, type Me, type Today } from "../src/lib/api";
import { haptics } from "../src/lib/haptics";
import { useTheme, space } from "../src/theme";
import type { CheckIn } from "../src/types";

const loadToday = async (): Promise<{ today: Today; me: Me }> => {
  const [today, me] = await Promise.all([api.today(), api.me()]);
  return { today, me };
};

export default function TodayScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const query = useQuery(loadToday);
  const [busy, setBusy] = useState<string | null>(null);

  const { setData, refresh } = query;

  /** Mark or undo, then show the server's answer. */
  const change = useCallback(async (checkInId: string, action: "done" | "undo") => {
    setBusy(checkInId);
    try {
      const updated = await (action === "done" ? api.markDone(checkInId) : api.undo(checkInId));
      if (action === "done") haptics.success();
      setData((d) => ({
        ...d,
        today: { ...d.today, today: d.today.today.map((i) => (i.checkIn.id === checkInId ? { ...i, checkIn: updated } : i)) },
      }));
      refresh(); // pick up the month summary
    } catch (e) {
      haptics.warning();
      const msg = e instanceof ApiError ? e.message : "Something went wrong. Try again.";
      Alert.alert(action === "done" ? "Couldn't mark it done" : "Couldn't undo", msg);
      refresh();
    } finally {
      setBusy(null);
    }
  }, [setData, refresh]);

  const heading = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader
          eyebrow={heading}
          title="Today"
          right={
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <IconButton
                icon="list"
                label="All commitments"
                onPress={() => router.push("/commitments")}
              />
              <IconButton
                icon="settings"
                label="Settings"
                onPress={() => router.push("/settings")}
              />
              <ThemeToggleButton />
            </View>
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          {query.status === "loading" ? (
            <>
              <TodaySkeleton />
              <Gap size={space.xl} />
              <RowsSkeleton rows={2} />
            </>
          ) : query.status === "error" ? (
            <ErrorState onRetry={query.retry} />
          ) : (
            <TodayContent
              data={query.data}
              busy={busy}
              onMarkDone={(ci) => change(ci.id, "done")}
              onUndo={(ci) => change(ci.id, "undo")}
              onOpen={(id) => router.push(`/commitment/${id}`)}
              onCreate={() => router.push("/commitment/new")}
            />
          )}

          <Gap size={space.xl} />
          <Button
            label="New commitment"
            onPress={() => router.push("/commitment/new")}
          />

          <DevFooter />
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}

function TodayContent({
  data, busy, onMarkDone, onUndo, onOpen, onCreate,
}: {
  data: { today: Today; me: Me };
  busy: string | null;
  onMarkDone: (ci: CheckIn) => void;
  onUndo: (ci: CheckIn) => void;
  onOpen: (commitmentId: string) => void;
  onCreate: () => void;
}) {
  const { today, upcoming } = data.today;
  const card = cardLabel(data.me.paymentMethod, "your card");

  if (today.length === 0 && upcoming.length === 0) {
    return <EmptyState onCreate={onCreate} />;
  }

  const nextDue = upcoming[0]
    ? new Date(upcoming[0].checkIn.deadlineAt).toLocaleDateString(undefined, { weekday: "long" })
    : null;

  return (
    <>
      {today.length === 0 ? (
        <RestDayCard nextDue={nextDue} />
      ) : (
        today.map((item, i) => (
          <View key={item.checkIn.id}>
            {i > 0 && <Gap size={space.md} />}
            <TodayCard
              // Remount when the status changes, so the undo window and
              // time-remaining footnote are re-read from the new state.
              key={`${item.checkIn.id}-${item.checkIn.status}`}
              commitment={item.commitment}
              checkIn={item.checkIn}
              monthCompleted={item.month?.completed ?? 0}
              monthScheduled={item.month?.scheduled ?? 0}
              passesUsed={item.month?.passesUsed ?? 0}
              cardLabel={card}
              onMarkDone={busy ? undefined : () => onMarkDone(item.checkIn)}
              onUndo={busy ? undefined : () => onUndo(item.checkIn)}
            />
          </View>
        ))
      )}

      {upcoming.length > 0 && (
        <>
          <Gap size={space.xl} />
          <RowGroup title="Later this week">
            {upcoming.map((item, i) => (
              <CommitmentRow
                key={item.checkIn.id}
                commitment={item.commitment}
                checkIn={item.checkIn}
                showDivider={i < upcoming.length - 1}
                onPress={() => onOpen(item.commitment.id)}
              />
            ))}
          </RowGroup>
        </>
      )}
    </>
  );
}
