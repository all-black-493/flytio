import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function TicketPreview() {
  const theme = useTheme();

  return (
    <View style={styles.illustration}>
      <View
        style={[
          styles.previewCard,
          styles.previewCardBack,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <ThemedText type="label" themeColor="textSecondary">
          From
        </ThemedText>
        <ThemedText type="bodyBold">Dhaka, DAC</ThemedText>
        <ThemedText type="label" themeColor="textSecondary" style={styles.previewSpacing}>
          To
        </ThemedText>
        <ThemedText type="bodyBold">Ottawa, YOW</ThemedText>
      </View>
      <View style={[styles.previewCard, styles.previewCardFront, { backgroundColor: theme.primary }]}>
        <ThemedText type="label" themeColor="onPrimary">
          Emirates
        </ThemedText>
        <View style={styles.previewRoute}>
          <ThemedText type="title" themeColor="onPrimary">
            DHK
          </ThemedText>
          <Ionicons name="airplane" size={18} color={theme.onPrimary} style={styles.previewPlane} />
          <ThemedText type="title" themeColor="onPrimary">
            OTW
          </ThemedText>
        </View>
        <ThemedText type="caption" themeColor="onPrimary">
          28 Aug &middot; Business
        </ThemedText>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText style={[styles.wordmark, { color: theme.primary }]}>Flyt</ThemedText>

        <TicketPreview />

        <View style={styles.copy}>
          <ThemedText type="display" style={styles.headline}>
            Let&apos;s Book Your Next Flight
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue"
            trailingIcon={<Ionicons name="arrow-forward" size={16} color={theme.onPrimary} />}
            onPress={() => router.replace('/(tabs)/home')}
          />
          <ThemedText
            type="label"
            themeColor="textSecondary"
            onPress={() => router.replace('/(tabs)/home')}
            style={styles.signIn}>
            Already have an account? <ThemedText type="label" themeColor="primary">Sign In</ThemedText>
          </ThemedText>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
  },
  illustration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    position: 'absolute',
    width: 220,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  previewCardBack: {
    borderWidth: 1,
    transform: [{ rotate: '-6deg' }, { translateX: -18 }, { translateY: 10 }],
  },
  previewCardFront: {
    transform: [{ rotate: '5deg' }, { translateX: 18 }, { translateY: -10 }],
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  previewSpacing: {
    marginTop: Spacing.two,
  },
  previewRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  previewPlane: {
    transform: [{ rotate: '90deg' }],
  },
  copy: {
    gap: Spacing.two,
  },
  headline: {
    textAlign: 'left',
  },
  actions: {
    gap: Spacing.three,
  },
  signIn: {
    textAlign: 'center',
  },
});
