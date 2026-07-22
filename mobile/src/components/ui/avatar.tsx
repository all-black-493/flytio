import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AvatarProps = {
  name: string;
  size?: number;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return initials.join('') || '?';
}

export function Avatar({ name, size = 44 }: AvatarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: Radius.pill, backgroundColor: theme.accent },
      ]}>
      <ThemedText type="label" themeColor="onPrimary" style={{ fontSize: size * 0.36 }}>
        {getInitials(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
