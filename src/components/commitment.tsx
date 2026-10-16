/**
 * commitment.tsx — display components specific to commitments.
 *
 * These sit above primitives (they know what a commitment is) but below
 * screens (they don't know about navigation or data fetching).
 */

import React from "react";
import { View } from "react-native";

import {
  Card, Body, Caption, Heading, MoneySm, StatusDot, PressableRow, Gap, styles,
} from "./primitives";
import { useTheme, space, radius, type, hairline } from "../theme";
import {
  formatClockTime, formatMoney, formatSchedule, WEEKDAY_INITIALS,
  type Commitment, type CheckIn, type Weekday,
} from "../types";
import type { CommitmentStats } from "../mock/data";

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------
// DayStrip — read-only schedule display
// ---------------------------------------------------------------
// Same shape as the DayPicker but non-interactive, so a commitment's
// schedule looks identical whether you're editing it or reading it.

export function DayStrip({ days, size = 30 }: { days: Weekday[]; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      {ALL_DAYS.map((d) => {
        const on = days.includes(d);
        return (
          <View
            key={d}
            style={{
              width: size, height: size,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? c.accent : c.surfaceSunken,
            }}
          >
            <Body style={[type.caption, { color: on ? c.onAccent : c.textMuted }]}>
              {WEEKDAY_INITIALS[d]}
            </Body>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------
// StatTile
// ---------------------------------------------------------------

export function StatTile({
  label, value, tone = "primary",
}: { label: string; value: string; tone?: "primary" | "kept" | "charged" }) {
  const { c } = useTheme();
  const color = { primary: c.textPrimary, kept: c.blockKeptFg, charged: c.blockChargedFg }[tone];

  return (
    <View style={{
      flex: 1,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.control,
      padding: space.md,
    }}>
      <Body style={[type.moneyLg, { color }]}>{value}</Body>
      <Gap size={space.xs} />
      <Caption>{label}</Caption>
    </View>
  );
}

export function StatRow({ stats }: { stats: CommitmentStats }) {
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <StatTile label="Kept" value={String(stats.kept)} tone="kept" />
      <StatTile label="Missed" value={String(stats.missed)} tone="charged" />
      <StatTile label="Paid" value={formatMoney(stats.paidCents, false)} />
    </View>
  );
}

// ---------------------------------------------------------------
// CommitmentSummaryCard — used in the commitments list
// ---------------------------------------------------------------

export function CommitmentSummaryCard({
  commitment, stats, onPress,
}: {
  commitment: Commitment;
  stats: CommitmentStats;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const paused = commitment.status === "paused";

  return (
    <PressableRow onPress={onPress}>
      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Heading numberOfLines={1}>{commitment.title}</Heading>
            <Gap size={space.xs} />
            <Caption>
              {formatSchedule(commitment.scheduleDays)} · {formatMoney(commitment.stakeCents, false)} per miss
            </Caption>
          </View>
          {paused && (
            <View style={{
              paddingHorizontal: space.sm,
              paddingVertical: 3,
              borderRadius: radius.pill,
              backgroundColor: c.surfaceSunken,
            }}>
              <Caption>Paused</Caption>
            </View>
          )}
        </View>

        <Gap size={space.md} />
        <DayStrip days={commitment.scheduleDays} size={26} />

        {stats.total > 0 && (
          <>
            <Gap size={space.md} />
            <KeptBar rate={stats.rate} />
            <Gap size={space.sm} />
            <Caption>
              {stats.kept} kept of {stats.total} · {formatMoney(stats.paidCents, false)} paid
            </Caption>
          </>
        )}
      </Card>
    </PressableRow>
  );
}

/**
 * A ratio bar rather than a streak counter. Streaks plus real money is
 * double jeopardy — losing a 40-day streak and paying $5 on the same night
 * is the kind of moment that makes people delete the app. A ratio recovers.
 */
function KeptBar({ rate }: { rate: number }) {
  const { c } = useTheme();
  const pct = Math.round(rate * 100);
  return (
    <View style={{
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      overflow: "hidden",
    }}>
      <View style={{
        width: `${pct}%`,
        height: "100%",
        borderRadius: radius.pill,
        backgroundColor: c.dotKept,
      }} />
    </View>
  );
}

// ---------------------------------------------------------------
// HistoryRow
// ---------------------------------------------------------------

export function HistoryRow({
  checkIn, showDivider = true,
}: { checkIn: CheckIn; showDivider?: boolean }) {
  const { c } = useTheme();

  const date = new Date(checkIn.deadlineAt).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });

  const detail = (() => {
    if (checkIn.status === "missed") return "Charged";
    if (checkIn.status === "excused") return "Free pass";
    if (checkIn.status === "pending") return "Due today";
    const e = checkIn.evidence;
    return e ? `Marked done ${formatClockTime(e.receivedAt)}` : "Kept";
  })();

  const moneyTone: "charged" | "muted" | "secondary" =
    checkIn.status === "missed" ? "charged"
    : checkIn.status === "verified" ? "muted"
    : "secondary";

  return (
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
        <Body numberOfLines={1}>{date}</Body>
        <Caption>{detail}</Caption>
      </View>
      <MoneySm tone={moneyTone}>
        {checkIn.status === "missed" ? `−${formatMoney(checkIn.stakeCents, false)}` : formatMoney(checkIn.stakeCents, false)}
      </MoneySm>
    </View>
  );
}
