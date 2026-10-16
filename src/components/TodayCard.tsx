/**
 * TodayCard.tsx — Block hero card.
 *
 * Structure is fixed across every state: date, task, stake block, footnote,
 * action. Only the block's fill, the footnote, and the action change, so
 * marking a day done reads as a state change rather than a screen
 * replacement.
 *
 * Copy stays factual. "Charged 11:59 pm" not "You missed it!" — the money
 * is the consequence, and adding disappointment on top is how one bad day
 * turns into an uninstall.
 */

import React, { useState } from "react";
import { View } from "react-native";
import {
  Card, Heading, Caption, StakeBlock, Button, Hairline, Gap, MoneySm, styles,
  type StakeState,
} from "./primitives";
import { HoldButton } from "./HoldButton";
import { space } from "../theme";
import { haptics } from "../lib/haptics";
import {
  formatClockTime, formatTimeRemaining,
  type CheckIn, type CheckInStatus, type Commitment,
} from "../types";

const STATE_MAP: Record<CheckInStatus, StakeState> = {
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
  passesUsed: number;
  cardLabel: string;
  onMarkDone?: () => void;
  onUndo?: () => void;
};

export function TodayCard({
  commitment, checkIn, monthCompleted, monthScheduled, passesUsed, cardLabel,
  onMarkDone, onUndo,
}: Props) {
  const dateLabel = new Date(checkIn.deadlineAt).toLocaleDateString(undefined, {
    weekday: "long",
  });

  // Undo is available until the deadline. After that the day has resolved
  // and history must match what was charged. Time is read once on mount,
  // like the time-remaining footnote; the server rejects a late undo anyway.
  const [mountedAt] = useState(() => Date.now());
  const canUndo =
    checkIn.status === "verified" && new Date(checkIn.deadlineAt).getTime() > mountedAt;

  return (
    <Card padding={space.lg}>
      <Caption>{dateLabel}</Caption>
      <Gap size={space.xs} />
      <Heading>{commitment.title}</Heading>
      <Gap size={space.lg} />

      <StakeBlock state={STATE_MAP[checkIn.status]} amountCents={checkIn.stakeCents} />

      <Gap size={space.md} />
      <Footnote
        checkIn={checkIn}
        passesUsed={passesUsed}
        passesTotal={commitment.freePassesPerMonth}
        cardLabel={cardLabel}
      />

      {checkIn.status === "pending" && (
        <>
          <Gap size={space.lg} />
          <HoldButton
            label="Hold to mark done"
            accessibilityHint={`Marks today's ${commitment.title} as done`}
            onComplete={() => onMarkDone?.()}
          />
          <Gap size={space.sm} />
          <Caption style={{ textAlign: "center" }}>
            On your honor. You can undo until 11:59 pm.
          </Caption>
        </>
      )}

      {canUndo && (
        <>
          <Gap size={space.md} />
          <Button
            label="Undo"
            variant="ghost"
            onPress={() => { haptics.light(); onUndo?.(); }}
          />
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

function Footnote({
  checkIn, passesUsed, passesTotal, cardLabel,
}: { checkIn: CheckIn; passesUsed: number; passesTotal: number; cardLabel: string }) {
  if (checkIn.status === "pending") {
    return <Caption>{formatTimeRemaining(checkIn.deadlineAt)} left</Caption>;
  }

  if (checkIn.status === "verified") {
    return checkIn.evidence
      ? <Caption>Marked done {formatClockTime(checkIn.evidence.receivedAt)}</Caption>
      : <Caption>Marked done</Caption>;
  }

  if (checkIn.status === "missed") {
    return <Caption>11:59 pm · {cardLabel}</Caption>;
  }

  if (checkIn.status === "excused") {
    return <Caption>{passesUsed} of {passesTotal} free passes used this month</Caption>;
  }

  return null;
}
