/**
 * DevPanel.tsx — preview controls rendered at the bottom of screens.
 *
 * Every export renders nothing unless SHOW_DEV_TOOLS is on, so screens can
 * include them unconditionally.
 */

import React from "react";
import { View, Pressable } from "react-native";

import { Caption, Label, Gap, Hairline } from "../components/primitives";
import { useTheme, space, radius, hairline } from "../theme";
import { haptics } from "../lib/haptics";
import { SHOW_DEV_TOOLS, useDev, type DataState } from "./DevTools";

export function DevPills<T extends string>({
  label, options, value, onChange,
}: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  if (!SHOW_DEV_TOOLS) return null;

  return (
    <View>
      <Caption>{label}</Caption>
      <Gap size={space.sm} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {options.map((o) => {
          const active = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => { haptics.tick(); onChange(o); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                borderWidth: hairline,
                borderColor: active ? c.accent : c.hairlineStrong,
                backgroundColor: active ? c.accentSoft : "transparent",
              }}
            >
              <Label tone={active ? "accent" : "muted"}>{o}</Label>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const DATA_STATES: readonly DataState[] = ["ready", "loading", "error"];

/** Simulate loading or error on every screen that uses useMockQuery. */
export function DataStatePills() {
  const { dataState, setDataState } = useDev();
  return (
    <DevPills
      label="Simulate data"
      options={DATA_STATES}
      value={dataState}
      onChange={setDataState}
    />
  );
}

/** A divider plus the data-state pills, for the foot of any data screen. */
export function DevFooter({ children }: { children?: React.ReactNode }) {
  if (!SHOW_DEV_TOOLS) return null;
  return (
    <View>
      <Gap size={space.xxl} />
      <Hairline />
      <Gap size={space.lg} />
      {children ? <>{children}<Gap size={space.lg} /></> : null}
      <DataStatePills />
    </View>
  );
}
