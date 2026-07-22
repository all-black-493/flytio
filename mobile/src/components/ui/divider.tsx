import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type DividerProps = ViewProps & {
  dashed?: boolean;
  color?: string;
};

export function Divider({ style, dashed = false, color, ...rest }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          borderColor: color ?? theme.border,
          borderStyle: dashed ? 'dashed' : 'solid',
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderTopWidth: 1,
    alignSelf: 'stretch',
  },
});
