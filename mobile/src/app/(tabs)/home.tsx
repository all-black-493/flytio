import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchForm } from '@/components/flights/search-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { IconCircleButton } from '@/components/ui/icon-circle-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const TRAVELER_NAME = 'Adman Jama';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Avatar name={TRAVELER_NAME} />
              <View>
                <ThemedText type="label" themeColor="textSecondary">
                  Welcome
                </ThemedText>
                <ThemedText type="bodyBold">{TRAVELER_NAME}</ThemedText>
              </View>
            </View>
            <IconCircleButton name="notifications-outline" accessibilityLabel="Notifications" />
          </View>

          <ThemedText type="display" style={styles.headline}>
            Fly High And Acquire Expertise
          </ThemedText>

          <SearchForm />
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
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headline: {
    marginTop: Spacing.two,
  },
});
