import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SeatMap } from '@/components/flights/seat-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconCircleButton } from '@/components/ui/icon-circle-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getMockSeatMap, mockOffers } from '@/data/mock-flights';

export default function SeatSelectionScreen() {
  const { offerId } = useLocalSearchParams<{ offerId?: string }>();
  const [selectedSeat, setSelectedSeat] = useState<string | null>('C2');
  const cabins = useMemo(() => getMockSeatMap(), []);
  const offer = mockOffers.find((o) => o.id === offerId) ?? mockOffers[0];

  function handleConfirm() {
    router.push({
      pathname: '/boarding-pass',
      params: { offerId: offer.id, seat: selectedSeat ?? '' },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <IconCircleButton
            name="chevron-back"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          />
          <ThemedText type="subtitle">Choose A Seat</ThemedText>
          <IconCircleButton name="share-social-outline" accessibilityLabel="Share" />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.airlineRow}>
            <Ionicons name="airplane" size={16} />
            <ThemedText type="bodyBold">{offer.owner?.name ?? 'Airline'}</ThemedText>
          </View>

          <SeatMap cabins={cabins} selectedSeat={selectedSeat} onSelectSeat={setSelectedSeat} />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={selectedSeat ? `Confirm Set ${selectedSeat}` : 'Select a seat'}
            disabled={!selectedSeat}
            onPress={handleConfirm}
          />
        </View>
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
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  airlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
});
