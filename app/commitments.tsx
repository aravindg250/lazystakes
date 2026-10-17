/**
 * app/commitments.tsx — every commitment, active and paused.
 *
 * Paused ones sort to the bottom rather than hiding in a filter. Someone
 * who paused a commitment three weeks ago and forgot has effectively
 * abandoned it; keeping it visible is a gentle prompt to either resume it
 * or delete it.
 */

import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Screen, Caption, Button, Gap } from "../src/components/primitives";
import { ScreenHeader, BackButton } from "../src/components/chrome";
import { CommitmentSummaryCard } from "../src/components/commitment";
import { EmptyState } from "../src/components/CommitmentRow";
import { SummaryCardsSkeleton, ErrorState } from "../src/components/states";
import { DevFooter } from "../src/dev/DevPanel";
import { useQuery } from "../src/lib/query";
import { api } from "../src/lib/api";
import { useTheme, space } from "../src/theme";

export default function CommitmentsScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const query = useQuery(api.commitments);

  // The server sends active first, newest first; archived ones never.
  const all = query.data ?? [];
  const active = all.filter((x) => x.commitment.status === "active");
  const paused = all.filter((x) => x.commitment.status !== "active");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <Screen>
        <ScreenHeader title="Commitments" left={<BackButton />} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          {query.status === "loading" ? (
            <SummaryCardsSkeleton />
          ) : query.status === "error" ? (
            <ErrorState onRetry={query.retry} />
          ) : all.length === 0 ? (
            <EmptyState onCreate={() => router.push("/commitment/new")} />
          ) : (
            <>
              {active.map(({ commitment: cm, stats }, i) => (
                <View key={cm.id}>
                  {i > 0 && <Gap size={space.md} />}
                  <CommitmentSummaryCard
                    commitment={cm}
                    stats={stats}
                    onPress={() => router.push(`/commitment/${cm.id}`)}
                  />
                </View>
              ))}

              {paused.length > 0 && (
                <>
                  <Gap size={space.xl} />
                  <Caption>Paused</Caption>
                  <Gap size={space.sm} />
                  {paused.map(({ commitment: cm, stats }, i) => (
                    <View key={cm.id}>
                      {i > 0 && <Gap size={space.md} />}
                      <CommitmentSummaryCard
                        commitment={cm}
                        stats={stats}
                        onPress={() => router.push(`/commitment/${cm.id}`)}
                      />
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <Gap size={space.xl} />
          <Button
            label="New commitment"
            variant="primary"
            onPress={() => router.push("/commitment/new")}
          />

          <DevFooter />
        </ScrollView>
      </Screen>
    </SafeAreaView>
  );
}
