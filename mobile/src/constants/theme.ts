/**
 * Flyt design tokens: colors, typography, and spacing for the mobile app.
 * Font is Poppins (loaded via @expo-google-fonts/poppins in the root layout)
 * to match the rounded, geometric sans used across the reference screens.
 */

import '@/global.css';

export const Colors = {
  light: {
    text: '#1F1512',
    textSecondary: '#8C7A74',
    background: '#FDFBF9',
    backgroundElement: '#F6EDE9',
    backgroundSelected: '#FBEAE8',
    surface: '#FFFFFF',
    border: '#F0E1DB',
    primary: '#B3261E',
    primaryDark: '#8C1A15',
    primaryMuted: '#FBEAE8',
    accent: '#F2A93B',
    accentDark: '#D68F22',
    onPrimary: '#FFFFFF',
    success: '#2E9E5B',
    danger: '#D33B3B',
    tabInactive: '#C8B7B1',
  },
  dark: {
    text: '#F7EEEA',
    textSecondary: '#B8A69F',
    background: '#17110F',
    backgroundElement: '#241B18',
    backgroundSelected: '#362822',
    surface: '#241B18',
    border: '#362822',
    primary: '#E4453B',
    primaryDark: '#B3261E',
    primaryMuted: '#3A211E',
    accent: '#F2B95A',
    accentDark: '#F2A93B',
    onPrimary: '#FFFFFF',
    success: '#4CBE81',
    danger: '#E86A63',
    tabInactive: '#5C4C46',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const FontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const BottomTabInset = 24;
export const MaxContentWidth = 800;
