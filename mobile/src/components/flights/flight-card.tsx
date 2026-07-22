import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Offer } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, formatPrice, formatTime } from '@/utils/format';

export type FlightCardProps = {
  offer: Offer;
  onPress?: () => void;
};

export function FlightCard({ offer, onPress }: FlightCardProps) {
  const theme = useTheme();
  const slice = offer.slices[0];
  const firstSegment = slice.segments[0];
  const lastSegment = slice.segments[slice.segments.length - 1];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.primary },
        pressed && styles.pressed,
      ]}>
      <View style={styles.routeRow}>
        <View style={styles.timeBlock}>
          <ThemedText type="subtitle" themeColor="onPrimary">
            {formatTime(firstSegment.departing_at)}
          </ThemedText>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {firstSegment.origin.iata_code}
          </ThemedText>
        </View>

        <View style={styles.pathBlock}>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {formatDuration(slice.duration)}
          </ThemedText>
          <View style={styles.pathLine}>
            <View style={[styles.dot, styles.mutedBg]} />
            <View style={[styles.line, styles.mutedBg]} />
            <Ionicons name="airplane" size={14} color={theme.onPrimary} style={styles.plane} />
            <View style={[styles.line, styles.mutedBg]} />
            <View style={[styles.dot, styles.mutedBg]} />
          </View>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {slice.segments.length > 1 ? `${slice.segments.length - 1} stop` : 'Direct'}
          </ThemedText>
        </View>

        <View style={[styles.timeBlock, styles.timeBlockEnd]}>
          <ThemedText type="subtitle" themeColor="onPrimary">
            {formatTime(lastSegment.arriving_at)}
          </ThemedText>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {lastSegment.destination.iata_code}
          </ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <ThemedText type="bodyBold" themeColor="onPrimary">
          {offer.owner?.name ?? 'Airline'}
        </ThemedText>
        <ThemedText type="title" themeColor="onPrimary">
          {formatPrice(offer.total_amount, offer.total_currency)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.9,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBlock: {
    gap: 2,
  },
  timeBlockEnd: {
    alignItems: 'flex-end',
  },
  pathBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  muted: {
    opacity: 0.75,
  },
  mutedBg: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  pathLine: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: Spacing.two,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  line: {
    flex: 1,
    height: 1,
  },
  plane: {
    marginHorizontal: Spacing.one,
    transform: [{ rotate: '90deg' }],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
});
