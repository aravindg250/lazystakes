/**
 * settings.tsx — rows used across settings, payment, and account screens.
 *
 * Three row types cover everything: navigate somewhere, flip a switch, or
 * display a read-only fact. Keeping it to three is what stops a settings
 * screen from turning into fifteen bespoke layouts.
 */

import React from "react";
import { View, Pressable, Switch } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { Card, Body, Caption, Gap } from "./primitives";
import { useTheme, space, hairline } from "../theme";
import { haptics } from "../lib/haptics";

export function Section({
  label, footnote, children,
}: { label?: string; footnote?: string; children: React.ReactNode }) {
  return (
    <View>
      {label ? (
        <>
          <Caption>{label}</Caption>
          <Gap size={space.sm} />
        </>
      ) : null}
      <Card padding={0} style={{ paddingHorizontal: space.lg }}>
        {children}
      </Card>
      {footnote ? (
        <>
          <Gap size={space.sm} />
          <Caption>{footnote}</Caption>
        </>
      ) : null}
    </View>
  );
}

const rowBase = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  gap: space.md,
  paddingVertical: space.md,
  minHeight: 52,
};

/** Tappable row that navigates somewhere. */
export function SettingsRow({
  label, value, onPress, divider = true, destructive = false,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  divider?: boolean;
  destructive?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        ...rowBase,
        borderBottomWidth: divider ? hairline : 0,
        borderBottomColor: c.hairline,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Body tone={destructive ? "charged" : "primary"}>{label}</Body>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
        {value ? <Body tone="secondary" numberOfLines={1}>{value}</Body> : null}
        {!destructive && <Feather name="chevron-right" size={16} color={c.textMuted} />}
      </View>
    </Pressable>
  );
}

/** Row with a switch. Includes an optional explanatory line beneath. */
export function ToggleRow({
  label, hint, value, onChange, divider = true,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  divider?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{
      borderBottomWidth: divider ? hairline : 0,
      borderBottomColor: c.hairline,
      paddingVertical: space.md,
    }}>
      <View style={{
        flexDirection: "row", alignItems: "center",
        justifyContent: "space-between", gap: space.md,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body>{label}</Body>
        </View>
        <Switch
          value={value}
          onValueChange={(v) => { haptics.tick(); onChange(v); }}
          trackColor={{ false: c.hairlineStrong, true: c.accent }}
          thumbColor={c.switchThumb}
          ios_backgroundColor={c.hairlineStrong}
        />
      </View>
      {hint ? (
        <>
          <Gap size={space.xs} />
          <Caption>{hint}</Caption>
        </>
      ) : null}
    </View>
  );
}

/** Read-only fact. No chevron, not tappable. */
export function InfoRow({
  label, value, divider = true,
}: { label: string; value: string; divider?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{
      ...rowBase,
      borderBottomWidth: divider ? hairline : 0,
      borderBottomColor: c.hairline,
    }}>
      <Caption>{label}</Caption>
      <Body numberOfLines={1}>{value}</Body>
    </View>
  );
}

/** Wraps arbitrary content in a settings row's padding and divider. */
export function CustomRow({
  children, divider = true,
}: { children: React.ReactNode; divider?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{
      paddingVertical: space.md,
      borderBottomWidth: divider ? hairline : 0,
      borderBottomColor: c.hairline,
    }}>
      {children}
    </View>
  );
}
