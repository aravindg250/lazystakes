/**
 * app/index.tsx — the today screen.
 *
 * Answers one question: is anything due, and have I done it?
 *
 * The preview pills at the bottom only render when dev tools are on (see
 * src/dev/DevTools.tsx). Delete them and the `scenario` state once the
 * backend is wired up.
 */

import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Button, Gap } from "../src/components/primitives";
import { ScreenHeader, ThemeToggleButton, IconButton } from "../src/components/chrome";
import { TodayCard } from "../src/components/TodayCard";
import {
  CommitmentRow, RowGroup, RestDayCard, EmptyState,
} from "../src/components/CommitmentRow";
import { TodaySkeleton, RowsSkeleton, ErrorState } from "../src/components/states";
import { DevFooter, DevPills } from "../src/dev/DevPanel";
import { useMockQuery } from "../src/dev/DevTools";
import { useTheme, space } from "../src/theme";
import {
  mockCommitments, mockCheckIns, mockMonthSummary, mockPaymentMethod,
} from "../src/mock/data";
import type { CheckIn } from "../src/types";

type Scenario = "pending" | "verified" | "missed" | "excused" | "rest" | "empty";
const SCENARIOS: readonly Scenario[] = ["pending", "verified", "missed", "excused", "rest", "empty"];

/** A plausible earlier-today time for the "verified" preview. */
function earlierToday(): string {
  const d = new Date();
  d.setHours(18, 42, 0, 0);
  return (d.getTime() < Date.now() ? d : new Date(Date.now() - 5 * 60_000)).toISOString();
}

export default function TodayScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("pending");

  // When the day was marked done, or null if it hasn't been. Local for now;
  // in Phase 3 this becomes a POST, and undo a DELETE, against the check-in.
  const [markedAt, setMarkedAt] = useState<string | null>(null);

  const query = useMockQuery(() => ({
    commitment: mockCommitments[0],
    today: mockCheckIns.find((ci) => ci.id === "ci-today")!,
    upcoming: mockCheckIns.filter((ci) => ci.status === "upcoming"),
  }));

  const pickScenario = (s: Scenario) => {
    setScenario(s);
    setMarkedAt(s === "verified" ? earlierToday() : null);
  };

  const todayCheckIn = (base: CheckIn): CheckIn => {
    if (scenario === "pending" || scenario === "verified") {
      return markedAt
        ? { ...base, status: "verified", evidence: { kind: "self_report", receivedAt: markedAt } }
        : { ...base, status: "pending", evidence: null };
    }
    return { ...base, status: scenario as CheckIn["status"], evidence: null };
  };

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
            <>
              {scenario === "empty" ? (
                <EmptyState onCreate={() => router.push("/commitment/new")} />
              ) : scenario === "rest" ? (
                <RestDayCard nextDue="Friday" />
              ) : (
                <TodayCard
                  commitment={query.data.commitment}
                  checkIn={todayCheckIn(query.data.today)}
                  monthCompleted={mockMonthSummary.completed + (markedAt ? 1 : 0)}
                  monthScheduled={mockMonthSummary.scheduled}
                  passesUsed={mockMonthSummary.passesUsed}
                  cardLabel={`${mockPaymentMethod.brand} ${mockPaymentMethod.last4}`}
                  onMarkDone={() => setMarkedAt(new Date().toISOString())}
                  onUndo={() => setMarkedAt(null)}
                />
              )}

              {scenario !== "empty" && query.data.upcoming.length > 0 && (
                <>
                  <Gap size={space.xl} />
                  <RowGroup title="Later this week">
                    {query.data.upcoming.map((ci, i) => {
                      const cm = mockCommitments.find((m) => m.id === ci.commitmentId)!;
                      return (
                        <CommitmentRow
                          key={ci.id}
                          commitment={cm}
                          checkIn={ci}
                          showDivider={i < query.data.upcoming.length - 1}
                          onPress={() => router.push(`/commitment/${cm.id}`)}
                        />
                      );
                    })}
                  </RowGroup>
                </>
              )}
            </>
          )}

          <Gap size={space.xl} />
          <Button
            label="New commitment"
            onPress={() => router.push("/commitment/new")}
          />

          <DevFooter>
            <DevPills
              label="Today state"
              options={SCENARIOS}
              value={scenario}
              onChange={pickScenario}
            />
          </DevFooter>
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}
