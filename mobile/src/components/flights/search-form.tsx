import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AirportField } from '@/components/flights/airport-field';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { IconCircleButton } from '@/components/ui/icon-circle-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Stepper } from '@/components/ui/stepper';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TRIP_TYPES = [
  { value: 'one_way', label: 'One way' },
  { value: 'round_trip', label: 'Round Trip' },
  { value: 'multi_city', label: 'Multi City' },
] as const;

type TripType = (typeof TRIP_TYPES)[number]['value'];

export function SearchForm() {
  const theme = useTheme();
  const [tripType, setTripType] = useState<TripType>('one_way');
  const [origin, setOrigin] = useState({ city: 'Dhaka', iataCode: 'DAC' });
  const [destination, setDestination] = useState({ city: 'Ottawa', iataCode: 'YOW' });
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);

  function swapAirports() {
    setOrigin(destination);
    setDestination(origin);
  }

  function handleSearch() {
    router.push({
      pathname: '/search-results',
      params: {
        originCity: origin.city,
        originCode: origin.iataCode,
        destinationCity: destination.city,
        destinationCode: destination.iataCode,
      },
    });
  }

  return (
    <Card style={styles.card}>
      <SegmentedControl options={TRIP_TYPES} value={tripType} onChange={setTripType} />

      <View style={styles.fieldGroup}>
        <AirportField label="From" city={origin.city} iataCode={origin.iataCode} icon="airplane" />
        <Divider style={styles.fieldDivider} />
        <AirportField
          label="To"
          city={destination.city}
          iataCode={destination.iataCode}
          icon="location"
        />
        <View style={styles.swapButton}>
          <IconCircleButton
            name="swap-vertical"
            variant="filled"
            size={36}
            accessibilityLabel="Swap origin and destination"
            onPress={swapAirports}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <ThemedText type="label" themeColor="textSecondary">
            Class
          </ThemedText>
          <View style={styles.rowValue}>
            <ThemedText type="bodyBold">Business</ThemedText>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </View>
        </View>
        <Divider style={styles.verticalDivider} />
        <View style={styles.rowItem}>
          <ThemedText type="label" themeColor="textSecondary">
            Date
          </ThemedText>
          <View style={styles.rowValue}>
            <ThemedText type="bodyBold">28 May 26</ThemedText>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </View>
        </View>
      </View>

      <Divider />

      <View style={styles.passengers}>
        <Stepper label="Adults" value={adults} min={1} onChange={setAdults} />
        <Stepper label="Children" value={children} onChange={setChildren} />
      </View>

      <Button label="Search flight" onPress={handleSearch} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.four,
  },
  fieldGroup: {
    gap: Spacing.three,
  },
  fieldDivider: {
    marginLeft: 52,
  },
  swapButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: [{ translateY: -18 }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowItem: {
    flex: 1,
    gap: Spacing.one,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  verticalDivider: {
    width: 1,
    height: '100%',
    borderTopWidth: 0,
    borderLeftWidth: 1,
    marginHorizontal: Spacing.three,
  },
  passengers: {
    gap: Spacing.three,
  },
});
