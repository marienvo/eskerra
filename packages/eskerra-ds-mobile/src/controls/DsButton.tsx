import type {PressableProps, StyleProp, TextStyle, ViewStyle} from 'react-native';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';

import {rnColors} from '@eskerra/tokens';

import {DsText} from '../primitives/DsText';

export type DsButtonVariant = 'primary' | 'secondary';

export type DsButtonProps = Omit<PressableProps, 'children'> & {
  variant?: DsButtonVariant;
  children: string;
  loading?: boolean;
};

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: rnColors.accent,
  },
  secondary: {
    backgroundColor: rnColors.surface,
    borderWidth: 1,
    borderColor: rnColors.border,
  },
  disabled: {
    opacity: 0.45,
  },
});

export function DsButton({
  variant = 'secondary',
  children,
  loading,
  disabled,
  style,
  ...rest
}: DsButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const variantStyle = variant === 'primary' ? styles.primary : styles.secondary;
  const labelColor =
    variant === 'primary' ? rnColors.editorText : rnColors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: isDisabled}}
      disabled={isDisabled}
      style={({pressed}) => [
        styles.base,
        variantStyle,
        isDisabled && styles.disabled,
        pressed && !isDisabled && {opacity: 0.88},
        style as StyleProp<ViewStyle>,
      ]}
      {...rest}
    >
      {loading ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <ActivityIndicator color={variant === 'primary' ? rnColors.editorText : rnColors.accent} />
          <DsText style={{color: labelColor} as TextStyle}>{children}</DsText>
        </View>
      ) : (
        <DsText style={{color: labelColor} as TextStyle}>{children}</DsText>
      )}
    </Pressable>
  );
}
