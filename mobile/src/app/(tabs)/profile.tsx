import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Personal information' },
  { icon: 'card-outline', label: 'Payment methods' },
  { icon: 'shield-checkmark-outline', label: 'Privacy & security' },
  { icon: 'help-circle-outline', label: 'Help & support' },
] as const;

export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Avatar name="Adman Jama" size={72} />
          <ThemedText type="title">Adman Jama</ThemedText>
          <ThemedText type="body" themeColor="textSecondary">
            adman.jama@example.com
          </ThemedText>
        </View>

        <Card style={styles.menu}>
          {MENU_ITEMS.map((item, index) => (
            <View key={item.label}>
              <View style={styles.menuRow}>
                <Ionicons name={item.icon} size={20} color={theme.primary} />
                <ThemedText type="body" style={styles.menuLabel}>
                  {item.label}
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
              {index < MENU_ITEMS.length - 1 && <Divider style={styles.menuDivider} />}
            </View>
          ))}
        </Card>
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.four,
  },
  menu: {
    gap: Spacing.three,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  menuLabel: {
    flex: 1,
  },
  menuDivider: {
    marginVertical: Spacing.three,
  },
});
