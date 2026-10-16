/**
 * chrome.tsx — screen furniture: the theme toggle and the screen header.
 *
 * Kept apart from primitives.tsx because these know about navigation and
 * icons, whereas primitives are pure presentation.
 */

import React from "react";
import { View, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";

import { Title, Caption } from "./primitives";
import { useTheme, space, radius } from "../theme";
import { haptics } from "../lib/haptics";

/**
 * A single tap flips light and dark. It intentionally leaves "system" —
 * once someone reaches for this control they've expressed a preference,
 * and silently snapping back to the OS setting later would feel broken.
 * System stays reachable from Settings.
 */
export function ThemeToggleButton() {
  const { c, isDark, setMode } = useTheme();

  return (
    <Pressable
      onPress={() => {
        haptics.tick();
        setMode(isDark ? "light" : "dark");
      }}
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather
        name={isDark ? "sun" : "moon"}
        size={17}
        color={c.textSecondary}
      />
    </Pressable>
  );
}

/** A generic circular icon button matching the theme toggle. */
export function IconButton({
  icon, onPress, label,
}: { icon: React.ComponentProps<typeof Feather>["name"]; onPress?: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={17} color={c.textSecondary} />
    </Pressable>
  );
}

export function BackButton() {
  const { c } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name="chevron-left" size={20} color={c.textPrimary} />
    </Pressable>
  );
}

/**
 * Header with an optional eyebrow, a title, and left/right slots.
 * `right` defaults to nothing so screens opt in to the theme toggle.
 */
export function ScreenHeader({
  title, eyebrow, left, right,
}: {
  title: string;
  eyebrow?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: space.md,
      paddingTop: space.lg,
      paddingBottom: space.lg,
    }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.md }}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Caption>{eyebrow}</Caption> : null}
          <Title numberOfLines={1}>{title}</Title>
        </View>
      </View>
      {right}
    </View>
  );
}
