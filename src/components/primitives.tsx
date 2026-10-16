/**
 * primitives.tsx — Block theme vocabulary.
 *
 * Nothing here knows about commitments. The one exception is
 * StakeBlock, which is domain-shaped on purpose: it's the signature
 * element of the whole design and deserves to live at the primitive layer
 * so its state-to-colour mapping is defined exactly once.
 */

import React from "react";
import {
  View, Text as RNText, Pressable, StyleSheet,
  type ViewStyle, type TextStyle, type StyleProp,
} from "react-native";
import Animated from "react-native-reanimated";
import { useTheme, space, radius, type, hairline, tabularNums } from "../theme";
import { formatMoney } from "../types";
import { haptics } from "../lib/haptics";

// ---------------------------------------------------------------
// Text
// ---------------------------------------------------------------

type TextTone =
  | "primary" | "secondary" | "muted" | "accent"
  | "kept" | "charged" | "onAccent";

type TextProps = {
  children: React.ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

function makeText(variant: TextStyle, defaultTone: TextTone = "primary") {
  return function Component({ children, tone = defaultTone, style, numberOfLines }: TextProps) {
    const { c } = useTheme();
    const color = {
      primary: c.textPrimary,
      secondary: c.textSecondary,
      muted: c.textMuted,
      accent: c.accentText,
      kept: c.blockKeptFg,
      charged: c.blockChargedFg,
      onAccent: c.onAccent,
    }[tone];
    return (
      <RNText numberOfLines={numberOfLines} style={[variant, { color }, style]}>
        {children}
      </RNText>
    );
  };
}

export const Title = makeText(type.title);
export const Heading = makeText(type.heading);
export const Body = makeText(type.body);
export const BodyMedium = makeText(type.bodyMedium);
export const Label = makeText(type.label, "secondary");
export const Caption = makeText(type.caption, "muted");
export const MoneyLg = makeText({ ...type.moneyLg, ...tabularNums });
export const MoneySm = makeText({ ...type.moneySm, ...tabularNums }, "secondary");

// ---------------------------------------------------------------
// StakeBlock — the signature element
// ---------------------------------------------------------------
// One shape, five meanings. The layout never changes between states, only
// the fill does, so a card doesn't reflow when a day is marked done. The
// fill fades between states rather than snapping — a state change, not a
// screen replacement.
//
// "Kept" rather than a strikethrough is deliberate: the money is still $5,
// you simply didn't lose it. Framing the good outcome as a retained amount
// rather than a cancelled charge is the whole emotional point of the app.

const FADE_BG = {
  transitionProperty: "backgroundColor",
  transitionDuration: 250,
} as const;

const FADE_COLOR = {
  transitionProperty: "color",
  transitionDuration: 250,
} as const;

export type StakeState = "pending" | "kept" | "charged" | "excused" | "idle";

const STATE_LABELS: Record<StakeState, string> = {
  pending: "At stake",
  kept: "Kept",
  charged: "Charged",
  excused: "Free pass",
  idle: "Upcoming",
};

export function StakeBlock({
  state, amountCents, size = "hero", labelOverride,
}: {
  state: StakeState;
  amountCents: number;
  size?: "hero" | "compact";
  labelOverride?: string;
}) {
  const { c } = useTheme();

  const fills = {
    pending: { bg: c.blockPendingBg, fg: c.blockPendingFg, label: c.blockPendingLabel },
    kept:    { bg: c.blockKeptBg,    fg: c.blockKeptFg,    label: c.blockKeptLabel },
    charged: { bg: c.blockChargedBg, fg: c.blockChargedFg, label: c.blockChargedLabel },
    excused: { bg: c.blockExcusedBg, fg: c.blockExcusedFg, label: c.blockExcusedLabel },
    idle:    { bg: c.blockIdleBg,    fg: c.blockIdleFg,    label: c.blockIdleLabel },
  }[state];

  const moneyStyle = size === "hero" ? type.moneyHero : type.moneyLg;

  return (
    <Animated.View style={{
      backgroundColor: fills.bg,
      borderRadius: radius.block,
      paddingVertical: size === "hero" ? space.lg : space.md,
      paddingHorizontal: space.lg,
      ...FADE_BG,
    }}>
      <Animated.Text style={[type.caption, { color: fills.label, marginBottom: space.xs }, FADE_COLOR]}>
        {labelOverride ?? STATE_LABELS[state]}
      </Animated.Text>
      <Animated.Text style={[moneyStyle, tabularNums, { color: fills.fg }, FADE_COLOR]}>
        {formatMoney(amountCents, false)}
      </Animated.Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------
// Containers
// ---------------------------------------------------------------

export function Card({
  children, style, padding = space.lg,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padding?: number }) {
  const { c } = useTheme();
  return (
    <View style={[{
      backgroundColor: c.surface,
      borderRadius: radius.card,
      padding,
    }, style]}>
      {children}
    </View>
  );
}

export function Sunken({
  children, style,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.control,
      padding: space.md,
    }, style]}>
      {children}
    </View>
  );
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: hairline, backgroundColor: c.hairline }, style]} />;
}

export function Gap({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

// ---------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------

export type DotStatus = "verified" | "pending" | "missed" | "excused" | "upcoming";

export function StatusDot({ status, size = 7 }: { status: DotStatus; size?: number }) {
  const { c } = useTheme();
  const color = {
    verified: c.dotKept, pending: c.dotPending, missed: c.dotCharged,
    excused: c.dotExcused, upcoming: c.dotIdle,
  }[status];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// ---------------------------------------------------------------
// Button
// ---------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  label, onPress, variant = "secondary", disabled = false, style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();

  const bg = { primary: c.accent, secondary: c.surfaceSunken, ghost: "transparent" }[variant];
  const fg = { primary: c.onAccent, secondary: c.textPrimary, ghost: c.accentText }[variant];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{
        minHeight: 50,
        borderRadius: radius.control,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      }, style]}
    >
      <RNText style={[type.bodyMedium, { color: fg }]}>{label}</RNText>
    </Pressable>
  );
}

export function PressableRow({
  children, onPress, style,
}: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------
// Segmented control — used by the theme switch, reusable later
// ---------------------------------------------------------------

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.control,
      padding: 3,
      gap: 3,
    }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (active) return;
              haptics.tick();
              onChange(opt.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              paddingVertical: space.sm,
              borderRadius: radius.control - 3,
              backgroundColor: active ? c.surface : "transparent",
              alignItems: "center",
            }}
          >
            <RNText style={[
              type.label,
              { color: active ? c.textPrimary : c.textMuted },
            ]}>
              {opt.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------

export function Screen({
  children, style,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: c.bg, paddingHorizontal: space.lg }, style]}>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowCenter: { flexDirection: "row", alignItems: "center" },
});
