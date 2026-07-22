import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconCircleButtonProps = Omit<PressableProps, 'style'> & {
  name: React.ComponentProps<typeof Ionicons>['name'];
  variant?: 'filled' | 'outline' | 'muted';
  size?: number;
  accessibilityLabel: string;
};

export function IconCircleButton({
  name,
  variant = 'outline',
  size = 40,
  ...rest
}: IconCircleButtonProps) {
  const theme = useTheme();

  const backgroundColor =
    variant === 'filled' ? theme.accent : variant === 'muted' ? theme.backgroundElement : theme.surface;
  const iconColor = variant === 'filled' ? theme.onPrimary : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: theme.border,
        },
        pressed && styles.pressed,
      ]}
      {...rest}>
      <Ionicons name={name} size={size * 0.5} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
