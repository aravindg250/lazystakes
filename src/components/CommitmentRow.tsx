/**
 * CommitmentRow.tsx — the Dense layout (variation D).
 *
 * Used for anything that isn't the hero: upcoming days, history, the
 * commitments list. Status lives in the dot, money stays quiet, and rows
 * are separated by hairlines rather than by being individual cards.
 */

import React from "react";
import { View } from "react-native";
import {
  Card, Body, Caption, MoneySm, StatusDot, PressableRow, Hairline, Gap, styles,
} from "./primitives";
import { useTheme, space, hairline } from "../theme";
import {
  formatMoney, WEEKDAY_LABELS,
  type CheckIn, type Commitment, type Weekday,
} from "../types";

type RowProps = {
  commitment: Commitment;
  checkIn: CheckIn;
  showDivider?: boolean;
  onPress?: () => void;
};

export function CommitmentRow({ commitment, checkIn, showDivider = true, onPress }: RowProps) {
  const { c } = useTheme();

  const weekday = new Date(checkIn.deadlineAt).getDay();
  const isoDay = (weekday === 0 ? 7 : weekday) as Weekday;

  const statusText = {
    pending: "pending", verified: "verified", missed: "charged",
    excused: "free pass", upcoming: "upcoming",
  }[checkIn.status];

  const dimmed = checkIn.status === "upcoming";

  return (
    <PressableRow onPress={onPress}>
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: space.md,
        borderBottomWidth: showDivider ? hairline : 0,
        borderBottomColor: c.hairline,
      }}>
        <StatusDot status={checkIn.status} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Body tone={dimmed ? "secondary" : "primary"} numberOfLines={1}>
            {commitment.title}
          </Body>
          <Caption>{WEEKDAY_LABELS[isoDay]} · {statusText}</Caption>
        </View>

        <MoneySm tone={checkIn.status === "pending" ? "primary" : "muted"}>
          {formatMoney(checkIn.stakeCents, false)}
        </MoneySm>
      </View>
    </PressableRow>
  );
}

/** A titled group of dense rows inside one card. */
export function RowGroup({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Caption>{title.toLowerCase()}</Caption>
      <Gap size={space.sm} />
      <Card padding={0} style={{ paddingHorizontal: space.lg }}>
        {children}
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------
// Rest day — nothing scheduled today
// ---------------------------------------------------------------
// Deliberately not celebratory. "Rest day" with the next due date is
// enough; a congratulatory message on a day you did nothing cheapens the
// verified state on days you did something.

export function RestDayCard({ nextDue }: { nextDue: string | null }) {
  return (
    <Card padding={space.xl}>
      <Caption>No commitments due</Caption>
      <Gap size={space.md} />
      <Body tone="secondary">
        {nextDue ? `Next up ${nextDue}.` : "Nothing scheduled."}
      </Body>
    </Card>
  );
}

// ---------------------------------------------------------------
// Empty state — no commitments at all
// ---------------------------------------------------------------
// An invitation, not an apology. Names the space, explains it in one line,
// and the button is a verb.

export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <Card padding={space.xl}>
      <Body>Set your first commitment</Body>
      <Gap size={space.sm} />
      <Body tone="secondary">
        Pick the days you'll show up and what you'll pay if you don't.
      </Body>
      <Gap size={space.xl} />
      <PressableRow onPress={onCreate}>
        <View style={{ alignSelf: "flex-start" }}>
          <Body tone="accent">Create commitment</Body>
        </View>
      </PressableRow>
    </Card>
  );
}
