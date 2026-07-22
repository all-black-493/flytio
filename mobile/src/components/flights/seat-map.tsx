import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { SeatCabin } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

export type SeatMapProps = {
  cabins: SeatCabin[];
  selectedSeat: string | null;
  onSelectSeat: (designator: string) => void;
};

const COLUMNS = ['A', 'B', 'C', 'D'] as const;

export function SeatMap({ cabins, selectedSeat, onSelectSeat }: SeatMapProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {cabins.map((cabin) => {
        const rowNumbers = Array.from(
          new Set(cabin.seats.map((seat) => Number(seat.designator.slice(1))))
        ).sort((a, b) => a - b);

        return (
          <View key={cabin.cabin_class} style={styles.cabin}>
            <ThemedText type="subtitle" style={styles.cabinLabel}>
              {cabin.rowLabel}
            </ThemedText>
            {rowNumbers.map((rowNumber) => (
              <View key={rowNumber} style={styles.row}>
                {COLUMNS.map((column, columnIndex) => {
                  const designator = `${column}${rowNumber}`;
                  const seat = cabin.seats.find((s) => s.designator === designator);
                  if (!seat) return <View key={designator} style={styles.seat} />;

                  const selected = designator === selectedSeat;

                  return (
                    <View key={designator}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Seat ${designator}`}
                        accessibilityState={{ selected, disabled: !seat.available }}
                        disabled={!seat.available}
                        onPress={() => onSelectSeat(designator)}
                        style={[
                          styles.seat,
                          {
                            backgroundColor: selected
                              ? theme.accent
                              : seat.available
                                ? theme.backgroundElement
                                : theme.border,
                          },
                          columnIndex === 1 && styles.aisleRight,
                        ]}>
                        <ThemedText
                          type="caption"
                          themeColor={selected ? 'onPrimary' : seat.available ? 'text' : 'textSecondary'}>
                          {designator}
                        </ThemedText>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.five,
  },
  cabin: {
    gap: Spacing.three,
    alignItems: 'center',
  },
  cabinLabel: {
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  seat: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleRight: {
    marginRight: Spacing.four,
  },
});
