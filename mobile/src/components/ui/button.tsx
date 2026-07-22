import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: 'primary' | 'outline' | 'ghost';
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  icon,
  trailingIcon,
  fullWidth = true,
  disabled,
  ...rest
}: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && { backgroundColor: theme.primary },
        variant === 'outline' && {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: theme.primary,
        },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      {...rest}>
      {icon}
      <ThemedText
        type="bodyBold"
        themeColor={variant === 'primary' ? 'onPrimary' : 'primary'}
        style={styles.label}>
        {label}
      </ThemedText>
      {trailingIcon && <View style={styles.trailing}>{trailingIcon}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    gap: Spacing.two,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    textAlign: 'center',
  },
  trailing: {
    position: 'absolute',
    right: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
