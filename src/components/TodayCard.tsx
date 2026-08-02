/**
 * TodayCard.tsx — Block hero card.
 *
 * Structure is fixed across every state: date, task, stake block, footnote.
 * Only the block's fill and the footnote text change, so verifying a
 * workout mid-day reads as a state change rather than a screen replacement.
 *
 * Copy stays factual. "Charged 11:59 pm" not "You missed it!" — the money
 * is the consequence, and adding disappointment on top is how one bad day
 * turns into an uninstall.
 */

import React from "react";
import { View } from "react-native";
import {
  Card, Heading, Body, Caption, StakeBlock, Button, Hairline, Gap, MoneySm, styles,
  type StakeState,
} from "./primitives";
import { space } from "../theme";
import { formatTimeRemaining, type CheckIn, type Commitment } from "../types";

const STATE_MAP: Record<string, StakeState> = {
  pending: "pending",
  verified: "kept",
  missed: "charged",
  excused: "excused",
  upcoming: "idle",
};

type Props = {
  commitment: Commitment;
  checkIn: CheckIn;
  monthCompleted: number;
  monthScheduled: number;
  onLogWorkout?: () => void;
};

export function TodayCard({
  commitment, checkIn, monthCompleted, monthScheduled, onLogWorkout,
}: Props) {
  const dateLabel = new Date(checkIn.deadlineAt).toLocaleDateString(undefined, {
    weekday: "long",
  });

  return (
    <Card padding={space.lg}>
      <Caption>{dateLabel}</Caption>
      <Gap size={space.xs} />
      <Heading>{commitment.title}</Heading>
      <Gap size={space.lg} />

      <StakeBlock state={STATE_MAP[checkIn.status]} amountCents={checkIn.stakeCents} />

      <Gap size={space.md} />
      <Footnote checkIn={checkIn} />

      {checkIn.status === "pending" && (
        <>
          <Gap size={space.lg} />
          <Button label="Log workout" variant="primary" onPress={onLogWorkout} />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            Apple Watch workouts verify automatically
          </Caption>
        </>
      )}

      <Gap size={space.lg} />
      <Hairline />
      <View style={[styles.rowBetween, { paddingTop: space.md }]}>
        <Caption>This month</Caption>
        <MoneySm tone="primary">{monthCompleted} of {monthScheduled}</MoneySm>
      </View>
    </Card>
  );
}

function Footnote({ checkIn }: { checkIn: CheckIn }) {
  if (checkIn.status === "pending") {
    return <Caption>{formatTimeRemaining(checkIn.deadlineAt)} left</Caption>;
  }

  if (checkIn.status === "verified" && checkIn.evidence) {
    const e = checkIn.evidence;
    const source =
      e.kind === "healthkit_workout" ? e.activityType ?? "Workout"
      : e.kind === "qr_scan" ? "Checked in by QR"
      : "Location verified";
    const mins = e.durationSec ? ` · ${Math.round(e.durationSec / 60)} min` : "";
    return <Caption>{source}{mins}</Caption>;
  }

  if (checkIn.status === "missed") {
    return <Caption>11:59 pm · Visa 4242</Caption>;
  }

  if (checkIn.status === "excused") {
    return <Caption>1 of 1 free passes used this month</Caption>;
  }

  return null;
}
