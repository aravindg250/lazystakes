/**
 * app/commitment/new.tsx — create a commitment.
 *
 * One scrollable screen rather than a wizard. Every decision here affects
 * every other one (three days at $10 is a very different commitment from
 * five days at $5), so keeping them all visible at once lets people reason
 * about the whole thing instead of discovering the total at the end.
 *
 * The exposure line at the bottom is the honest disclosure: it states the
 * worst case in plain money before anyone commits to anything.
 */

import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Body, Caption, Button, Gap, Sunken, styles } from "../../src/components/primitives";
import { ScreenHeader, BackButton } from "../../src/components/chrome";
import {
  DayPicker, StakeStepper, FieldGroup, TextField, NavRow,
} from "../../src/components/form";
import { useTheme, space } from "../../src/theme";
import { formatMoney, formatSchedule, type Weekday } from "../../src/types";
import { mockVenues } from "../../src/mock/data";

export default function NewCommitmentScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const [title, setTitle] = useState("Go to the gym");
  const [days, setDays] = useState<Weekday[]>([1, 3, 5]);
  const [stakeCents, setStakeCents] = useState(500);
  const [venueId, setVenueId] = useState<string | null>(mockVenues[0].id);

  const venue = mockVenues.find((v) => v.id === venueId) ?? null;
  const valid = title.trim().length > 0 && days.length > 0;

  // Worst case per week, and per month with free passes accounted for.
  const weeklyMax = days.length * stakeCents;
  const monthlyMax = Math.max(0, days.length * 4 - 1) * stakeCents;

  const goToConfirm = () => {
    router.push({
      pathname: "/commitment/confirm",
      params: {
        title: title.trim(),
        days: days.join(","),
        stakeCents: String(stakeCents),
        venueName: venue?.name ?? "",
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader title="New commitment" left={<BackButton />} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <FieldGroup label="What are you committing to">
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder="Go to the gym"
            />
          </FieldGroup>

          <Gap size={space.xl} />

          <FieldGroup
            label="Which days"
            hint={days.length > 0 ? formatSchedule(days) : "Pick at least one day."}
          >
            <DayPicker value={days} onChange={setDays} />
          </FieldGroup>

          <Gap size={space.xl} />

          <FieldGroup
            label="Stake per miss"
            hint="You can raise this later, but not on a day that's already due."
          >
            <StakeStepper value={stakeCents} onChange={setStakeCents} />
          </FieldGroup>

          <Gap size={space.xl} />

          <FieldGroup
            label="How you'll prove it"
            hint="Apple Watch workouts verify on their own. The QR check-in is a manual backup."
          >
            <NavRow
              label="Gym"
              value={venue?.name}
              showDivider
              onPress={() => {
                const i = mockVenues.findIndex((v) => v.id === venueId);
                setVenueId(mockVenues[(i + 1) % mockVenues.length].id);
              }}
            />
            <NavRow label="Verification" value="Health + QR" />
          </FieldGroup>

          <Gap size={space.xl} />

          <Sunken>
            <View style={styles.rowBetween}>
              <Caption>Most you could pay in a week</Caption>
              <Body tone="primary">{formatMoney(weeklyMax, false)}</Body>
            </View>
            <Gap size={space.sm} />
            <View style={styles.rowBetween}>
              <Caption>In a month, after 1 free pass</Caption>
              <Body tone="primary">{formatMoney(monthlyMax, false)}</Body>
            </View>
          </Sunken>

          <Gap size={space.xl} />

          <Button
            label="Review commitment"
            variant="primary"
            disabled={!valid}
            onPress={goToConfirm}
          />
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}
