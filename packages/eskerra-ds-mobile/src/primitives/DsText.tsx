import type {TextProps} from 'react-native';
import {StyleSheet, Text} from 'react-native';

import {rnColors} from '@eskerra/tokens';

export type DsTextVariant = 'body' | 'muted' | 'title';

export type DsTextProps = TextProps & {
  variant?: DsTextVariant;
};

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: rnColors.textPrimary,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: rnColors.textSecondary,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    color: rnColors.textPrimary,
  },
});

export function DsText({variant = 'body', style, ...rest}: DsTextProps) {
  const variantStyle = variant === 'muted' ? styles.muted : variant === 'title' ? styles.title : styles.body;
  return <Text style={[variantStyle, style]} {...rest} />;
}
