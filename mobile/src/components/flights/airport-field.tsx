import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AirportFieldProps = {
  label: string;
  city: string;
  iataCode: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
};

export function AirportField({ label, city, iataCode, icon, onPress }: AirportFieldProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={16} color={theme.primary} />
      </View>
      <View style={styles.text}>
        <ThemedText type="label" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="bodyBold">
          {city}, {iataCode}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    gap: 2,
  },
});
