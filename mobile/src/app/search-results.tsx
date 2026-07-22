import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlightCard } from '@/components/flights/flight-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconCircleButton } from '@/components/ui/icon-circle-button';
import { Pill } from '@/components/ui/pill';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { mockOffers } from '@/data/mock-flights';
import type { Offer } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

const FILTERS = ['Economy', 'Business', 'Modify'] as const;

export default function SearchResultsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    originCity?: string;
    originCode?: string;
    destinationCity?: string;
    destinationCode?: string;
  }>();
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('Economy');

  const routeLabel =
    params.originCode && params.destinationCode
      ? `${params.originCode} → ${params.destinationCode}`
      : null;

  const renderItem = useCallback(
    ({ item }: { item: Offer }) => (
      <FlightCard
        offer={item}
        onPress={() =>
          router.push({ pathname: '/seat-selection', params: { offerId: item.id } })
        }
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: Offer) => item.id, []);

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View>
          <ThemedText type="display">{mockOffers.length} Flights</ThemedText>
          <ThemedText type="display">Available</ThemedText>
          {routeLabel && (
            <ThemedText type="body" themeColor="textSecondary" style={styles.routeLabel}>
              {routeLabel}
            </ThemedText>
          )}
        </View>
        <View style={[styles.globeWrap, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="earth" size={28} color={theme.primary} />
        </View>
      </View>
    ),
    [routeLabel, theme]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <IconCircleButton
            name="chevron-back"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          />
          <ThemedText type="subtitle">Search Result</ThemedText>
          <IconCircleButton name="notifications-outline" accessibilityLabel="Notifications" />
        </View>

        <FlatList
          data={mockOffers}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={
            <>
              {listHeader}
              <View style={styles.filters}>
                {FILTERS.map((filter) => (
                  <Pill
                    key={filter}
                    label={filter}
                    selected={activeFilter === filter}
                    onPress={() => setActiveFilter(filter)}
                  />
                ))}
              </View>
            </>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  routeLabel: {
    marginTop: Spacing.one,
  },
  globeWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  separator: {
    height: Spacing.three,
  },
});
