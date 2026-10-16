/**
 * states.tsx — loading and error states for screens that fetch data.
 *
 * Skeletons mirror the shape of what they stand in for, so content
 * arriving reads as the same layout filling in rather than a jump. They
 * pulse slowly; a fast shimmer would add exactly the urgency the rest of
 * the design avoids.
 *
 * Error copy is factual and points at the next action. It never implies
 * the user's money is in doubt — a failed fetch changes nothing on the
 * server, and saying so heads off a panicked support email.
 */

import React, { useEffect, useState } from "react";
import { Animated, View, type DimensionValue } from "react-native";

import { Card, Body, Gap, Button, Hairline } from "./primitives";
import { useTheme, space, radius } from "../theme";

// ---------------------------------------------------------------
// Skeleton primitives
// ---------------------------------------------------------------

function usePulse() {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

export function Skeleton({
  width = "100%", height, rounded = radius.control,
}: { width?: DimensionValue; height: number; rounded?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width, height, borderRadius: rounded, backgroundColor: c.skeleton }} />
  );
}

/** Wraps skeleton content in one shared pulse, so blocks breathe together. */
function Pulse({ children }: { children: React.ReactNode }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ opacity }}
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------
// Screen-shaped skeletons
// ---------------------------------------------------------------

/** Same outline as TodayCard: date, title, stake block, footnote, button. */
export function TodaySkeleton() {
  return (
    <Pulse>
      <Card padding={space.lg}>
        <Skeleton width={70} height={11} />
        <Gap size={space.sm} />
        <Skeleton width="55%" height={17} />
        <Gap size={space.lg} />
        <Skeleton height={86} rounded={radius.block} />
        <Gap size={space.md} />
        <Skeleton width={110} height={11} />
        <Gap size={space.lg} />
        <Skeleton height={50} />
        <Gap size={space.lg} />
        <Hairline />
        <Gap size={space.md} />
        <Skeleton width={90} height={11} />
      </Card>
    </Pulse>
  );
}

/** A card of dense rows, for upcoming days, history, and charges. */
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Pulse>
      <SkeletonRows rows={rows} />
    </Pulse>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <Card padding={0} style={{ paddingHorizontal: space.lg }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }}
        >
          <Skeleton width={7} height={7} rounded={radius.pill} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={10} />
          </View>
          <Skeleton width={28} height={13} />
        </View>
      ))}
    </Card>
  );
}

/** Same outline as CommitmentSummaryCard. */
export function SummaryCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Pulse>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          {i > 0 && <Gap size={space.md} />}
          <Card>
            <Skeleton width="50%" height={17} />
            <Gap size={space.sm} />
            <Skeleton width="40%" height={11} />
            <Gap size={space.md} />
            <Skeleton width={206} height={26} rounded={radius.pill} />
            <Gap size={space.md} />
            <Skeleton height={6} rounded={radius.pill} />
          </Card>
        </View>
      ))}
    </Pulse>
  );
}

/** Stake block, stat tiles, and history — the commitment detail outline. */
export function DetailSkeleton() {
  return (
    <Pulse>
      <Card>
        <Skeleton height={86} rounded={radius.block} />
        <Gap size={space.lg} />
        <Skeleton width={226} height={30} rounded={radius.pill} />
      </Card>
      <Gap size={space.xl} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={68} /></View>
        <View style={{ flex: 1 }}><Skeleton height={68} /></View>
        <View style={{ flex: 1 }}><Skeleton height={68} /></View>
      </View>
      <Gap size={space.xl} />
      <SkeletonRows rows={4} />
    </Pulse>
  );
}

// ---------------------------------------------------------------
// Error
// ---------------------------------------------------------------

export function ErrorState({
  title = "Couldn't load this",
  message = "Check your connection and try again. Nothing about your commitments has changed.",
  onRetry,
}: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <Card padding={space.xl}>
      <Body>{title}</Body>
      <Gap size={space.sm} />
      <Body tone="secondary">{message}</Body>
      {onRetry && (
        <>
          <Gap size={space.xl} />
          <Button label="Try again" onPress={onRetry} />
        </>
      )}
    </Card>
  );
}
