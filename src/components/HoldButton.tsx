/**
 * HoldButton.tsx — press and hold to confirm.
 *
 * Used for "Mark done", the one action in the app that decides whether
 * someone pays. A tap isn't enough (pockets, toddlers, misfires) but a
 * dialog on every gym day would get old by week two. Holding for under a
 * second is deliberate without being a chore.
 *
 * The fill sweeps left to right while held, with light ticks at a third
 * and two thirds so the gesture can be felt as well as seen. Letting go
 * early drains the fill and does nothing.
 *
 * Screen readers can't hold, so the accessibility "activate" action (a
 * double-tap in VoiceOver/TalkBack) completes it directly.
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import { useTheme, space, radius, type } from "../theme";
import { haptics } from "../lib/haptics";

const HOLD_MS = 800;
const TICKS = [1 / 3, 2 / 3];

export function HoldButton({
  label, onComplete, accessibilityHint,
}: { label: string; onComplete: () => void; accessibilityHint?: string }) {
  const { c } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const ticked = useRef<Set<number>>(new Set());
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [buttonWidth, setButtonWidth] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      TICKS.forEach((t) => {
        if (value >= t && !ticked.current.has(t)) {
          ticked.current.add(t);
          haptics.tick();
        }
      });
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const start = () => {
    ticked.current.clear();
    haptics.tick();
    anim.current?.stop();
    anim.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (!finished) return;
      haptics.success();
      progress.setValue(0);
      onComplete();
    });
  };

  const cancel = () => {
    anim.current?.stop();
    anim.current = Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    });
    anim.current.start();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      onLayout={(e) => setButtonWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? "Press and hold to confirm"}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate") {
          haptics.success();
          onComplete();
        }
      }}
      style={{
        minHeight: 50,
        borderRadius: radius.control,
        backgroundColor: c.accentSoft,
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0, top: 0, bottom: 0,
          width,
          backgroundColor: c.accent,
        }}
      />
      <View style={{ alignItems: "center", paddingHorizontal: space.lg }}>
        <Text style={[type.bodyMedium, { color: c.accentText }]}>{label}</Text>
      </View>
      {/* Second copy of the label in the on-accent colour, clipped to the
          fill, so the text stays readable as the fill passes under it. The
          inner view is pinned to the button's full width so both copies of
          the label sit exactly on top of each other. */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0, top: 0, bottom: 0,
          width,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <View style={{
          width: buttonWidth,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: space.lg,
        }}>
          <Text style={[type.bodyMedium, { color: c.onAccent }]}>{label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
