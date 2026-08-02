/**
 * form.tsx — the controls used to build a commitment.
 *
 * These are the highest-stakes UI in the app: this is where someone decides
 * how much money they're putting at risk. Everything here favours clarity
 * over cleverness — no sliders for money (too easy to overshoot), no
 * hidden defaults, no dark patterns nudging the number upward.
 */

import React from "react";
import { View, Pressable, TextInput } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { Card, Body, Caption, Label, Gap, styles } from "./primitives";
import { useTheme, space, radius, type, hairline } from "../theme";
import { WEEKDAY_INITIALS, formatMoney, type Weekday } from "../types";

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------
// DayPicker
// ---------------------------------------------------------------

export function DayPicker({
  value, onChange,
}: { value: Weekday[]; onChange: (days: Weekday[]) => void }) {
  const { c } = useTheme();

  const toggle = (d: Weekday) => {
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  };

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      {ALL_DAYS.map((d) => {
        const active = value.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => toggle(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${WEEKDAY_INITIALS[d]}, ${active ? "selected" : "not selected"}`}
            style={({ pressed }) => ({
              width: 40, height: 40,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? c.accent : c.surfaceSunken,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Body
              style={[
                type.bodyMedium,
                { color: active ? c.onAccent : c.textMuted },
              ]}
            >
              {WEEKDAY_INITIALS[d]}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------
// StakeStepper
// ---------------------------------------------------------------
// Stepped in $1 increments with a hard ceiling. The cap isn't a technical
// limitation — it's a safety rail. The failure mode of these apps is
// someone setting $200, getting sick for a week, and spiralling. A ceiling
// plus free passes keeps it motivating rather than punishing, and keeps
// your chargeback rate survivable.

export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 5000;
const PRESETS = [500, 1000, 2000];

export function StakeStepper({
  value, onChange,
}: { value: number; onChange: (cents: number) => void }) {
  const { c } = useTheme();

  const step = (delta: number) => {
    const next = Math.min(MAX_STAKE_CENTS, Math.max(MIN_STAKE_CENTS, value + delta));
    onChange(next);
  };

  const atMin = value <= MIN_STAKE_CENTS;
  const atMax = value >= MAX_STAKE_CENTS;

  return (
    <View>
      <View style={[styles.rowBetween, { marginBottom: space.md }]}>
        <StepButton icon="minus" onPress={() => step(-100)} disabled={atMin} />
        <Body style={[type.moneyHero, { color: c.textPrimary }]}>
          {formatMoney(value, false)}
        </Body>
        <StepButton icon="plus" onPress={() => step(100)} disabled={atMax} accent />
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        {PRESETS.map((p) => {
          const active = p === value;
          return (
            <Pressable
              key={p}
              onPress={() => onChange(p)}
              accessibilityRole="button"
              style={{
                flex: 1,
                paddingVertical: space.sm,
                borderRadius: radius.control,
                backgroundColor: active ? c.accentSoft : c.surfaceSunken,
                alignItems: "center",
              }}
            >
              <Label tone={active ? "accent" : "muted"}>{formatMoney(p, false)}</Label>
            </Pressable>
          );
        })}
      </View>

      {atMax && (
        <>
          <Gap size={space.sm} />
          <Caption>{formatMoney(MAX_STAKE_CENTS, false)} is the maximum stake.</Caption>
        </>
      )}
    </View>
  );
}

function StepButton({
  icon, onPress, disabled, accent = false,
}: {
  icon: "plus" | "minus";
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={icon === "plus" ? "Increase stake" : "Decrease stake"}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 46, height: 46,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent ? c.accent : c.surfaceSunken,
        opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
      })}
    >
      <Feather name={icon} size={20} color={accent ? c.onAccent : c.textSecondary} />
    </Pressable>
  );
}

// ---------------------------------------------------------------
// FieldGroup — a labelled section inside the form
// ---------------------------------------------------------------

export function FieldGroup({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View>
      <Caption>{label}</Caption>
      <Gap size={space.sm} />
      <Card>{children}</Card>
      {hint ? (
        <>
          <Gap size={space.sm} />
          <Caption>{hint}</Caption>
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------
// TextField
// ---------------------------------------------------------------

export function TextField({
  value, onChangeText, placeholder,
}: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.textMuted}
      style={[type.body, { color: c.textPrimary, padding: 0, minHeight: 24 }]}
    />
  );
}

// ---------------------------------------------------------------
// NavRow — a tappable row that leads somewhere else
// ---------------------------------------------------------------

export function NavRow({
  label, value, onPress, showDivider = false,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
        paddingVertical: space.md,
        borderBottomWidth: showDivider ? hairline : 0,
        borderBottomColor: c.hairline,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Body>{label}</Body>
      <View style={[styles.rowCenter, { gap: space.xs, flexShrink: 1 }]}>
        <Body tone="secondary" numberOfLines={1}>{value ?? "Not set"}</Body>
        <Feather name="chevron-right" size={16} color={c.textMuted} />
      </View>
    </Pressable>
  );
}
