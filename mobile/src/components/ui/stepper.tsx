import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type StepperProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

export function Stepper({ label, value, min = 0, max = 9, onChange }: StepperProps) {
  const theme = useTheme();
  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <View style={styles.row}>
      <ThemedText type="body" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={!canDecrement}
          onPress={() => onChange(value - 1)}
          style={[
            styles.circle,
            { backgroundColor: theme.backgroundElement },
            !canDecrement && styles.disabled,
          ]}>
          <Ionicons name="remove" size={16} color={theme.text} />
        </Pressable>
        <ThemedText type="bodyBold" style={styles.value}>
          {value}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={!canIncrement}
          onPress={() => onChange(value + 1)}
          style={[styles.circle, { backgroundColor: theme.primary }, !canIncrement && styles.disabled]}>
          <Ionicons name="add" size={16} color={theme.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 20,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
