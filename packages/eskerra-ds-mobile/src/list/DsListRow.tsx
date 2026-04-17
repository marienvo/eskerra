import type {PressableProps, StyleProp, ViewStyle} from 'react-native';
import {Pressable, StyleSheet, View} from 'react-native';

import {rnColors} from '@eskerra/tokens';

import {DsText} from '../primitives/DsText';

export type DsListRowProps = Omit<PressableProps, 'children'> & {
  title: string;
  subtitle?: string;
};

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: rnColors.border,
    justifyContent: 'center',
  },
});

export function DsListRow({title, subtitle, style, ...rest}: DsListRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({pressed}) => [
        styles.row,
        pressed && {backgroundColor: rnColors.accentSubtleBg},
        style as StyleProp<ViewStyle>,
      ]}
      {...rest}
    >
      <DsText variant="title">{title}</DsText>
      {subtitle ? <DsText variant="muted">{subtitle}</DsText> : null}
    </Pressable>
  );
}
