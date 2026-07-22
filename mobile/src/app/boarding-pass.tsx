import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoardingPassCard } from '@/components/flights/boarding-pass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconCircleButton } from '@/components/ui/icon-circle-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { mockOffers } from '@/data/mock-flights';
import type { Order } from '@/data/types';

export default function BoardingPassScreen() {
  const { offerId, seat } = useLocalSearchParams<{ offerId?: string; seat?: string }>();
  const offer = mockOffers.find((o) => o.id === offerId) ?? mockOffers[0];

  const order: Order = useMemo(
    () => ({
      id: `ord_mock_${offer.id}`,
      booking_reference: 'ZXCSDY',
      total_amount: offer.total_amount,
      total_currency: offer.total_currency,
      owner: offer.owner,
      slices: offer.slices,
      passengers: [{ given_name: 'Adman', family_name: 'Jama' }],
    }),
    [offer]
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
          <ThemedText type="subtitle">Boarding Pass</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BoardingPassCard
            order={order}
            passengerName="Adman"
            seat={seat || 'C2'}
            cabinClass="Business"
          />
          <Button label="Download Ticket" />
        </ScrollView>
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
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
});
