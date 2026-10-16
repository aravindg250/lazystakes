/**
 * haptics.ts — the app's whole haptic vocabulary, in one place.
 *
 * Five feelings, mapped to moments rather than to components, so the same
 * kind of action always feels the same wherever it happens. Failures are
 * swallowed: a device without a haptic engine (or the web build) should
 * never surface an error for something purely decorative.
 */

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const enabled = Platform.OS === "ios" || Platform.OS === "android";

function fire(fn: () => Promise<void>) {
  if (!enabled) return;
  fn().catch(() => {});
}

export const haptics = {
  /** A choice changed: day chips, stake steps, toggles, checkboxes. */
  tick: () => fire(() => Haptics.selectionAsync()),

  /** Hit a hard limit: the $1 floor or the stake cap. */
  bump: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** A small reversible action, like undoing a mark-done. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** The day is marked done. Quiet success — one pulse, no fanfare. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** About to do something destructive. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
