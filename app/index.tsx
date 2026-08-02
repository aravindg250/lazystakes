/**
 * app/index.tsx — the today screen.
 *
 * Answers one question: is anything due, and have I done it?
 *
 * The scenario pills at the bottom are a build-time affordance. Delete them
 * (and the `scenario` state) once the backend is wired up.
 */

import React, { useMemo, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  Screen, Caption, Label, Button, Gap, Hairline,
} from "../src/components/primitives";
import { ScreenHeader, ThemeToggleButton, IconButton } from "../src/components/chrome";
import { TodayCard } from "../src/components/TodayCard";
import {
  CommitmentRow, RowGroup, RestDayCard, EmptyState,
} from "../src/components/CommitmentRow";
import { useTheme, space, radius, hairline } from "../src/theme";
import { mockCommitments, mockCheckIns, mockMonthSummary } from "../src/mock/data";
import type { CheckIn, CheckInStatus } from "../src/types";

type Scenario = "pending" | "verified" | "missed" | "excused" | "rest" | "empty";
const SCENARIOS: Scenario[] = ["pending", "verified", "missed", "excused", "rest", "empty"];

export default function TodayScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("pending");

  const commitment = mockCommitments[0];

  const todayCheckIn: CheckIn | null = useMemo(() => {
    if (scenario === "rest" || scenario === "empty") return null;
    const base = mockCheckIns.find((ci) => ci.id === "ci-today")!;
    const verifiedSample = mockCheckIns.find((ci) => ci.status === "verified")!;
    return {
      ...base,
      status: scenario as CheckInStatus,
      evidence: scenario === "verified" ? verifiedSample.evidence : null,
    };
  }, [scenario]);

  const upcoming = mockCheckIns.filter((ci) => ci.status === "upcoming");

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
          {scenario === "empty" ? (
            <EmptyState onCreate={() => router.push("/commitment/new")} />
          ) : scenario === "rest" ? (
            <RestDayCard nextDue="Friday" />
          ) : (
            <TodayCard
              commitment={commitment}
              checkIn={todayCheckIn!}
              monthCompleted={mockMonthSummary.completed}
              monthScheduled={mockMonthSummary.scheduled}
              onLogWorkout={() => {}}
            />
          )}

          {scenario !== "empty" && upcoming.length > 0 && (
            <>
              <Gap size={space.xl} />
              <RowGroup title="Later this week">
                {upcoming.map((ci, i) => {
                  const cm = mockCommitments.find((m) => m.id === ci.commitmentId)!;
                  return (
                    <CommitmentRow
                      key={ci.id}
                      commitment={cm}
                      checkIn={ci}
                      showDivider={i < upcoming.length - 1}
                    />
                  );
                })}
              </RowGroup>
            </>
          )}

          <Gap size={space.xl} />
          <Button
            label="New commitment"
            onPress={() => router.push("/commitment/new")}
          />

          <Gap size={space.xxl} />
          <Hairline />
          <Gap size={space.lg} />
          <Caption>Preview state</Caption>
          <Gap size={space.sm} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {SCENARIOS.map((s) => {
              const active = s === scenario;
              return (
                <Pressable
                  key={s}
                  onPress={() => setScenario(s)}
                  style={{
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    borderWidth: hairline,
                    borderColor: active ? c.accent : c.hairlineStrong,
                    backgroundColor: active ? c.accentSoft : "transparent",
                  }}
                >
                  <Label tone={active ? "accent" : "muted"}>{s}</Label>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}
