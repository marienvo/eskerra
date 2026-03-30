import React from 'react';
import {
  ActivityIndicator,
  Button as RNButton,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';

type ChildrenProps = {
  children?: React.ReactNode;
};

type ButtonProps = ChildrenProps & {
  isDisabled?: boolean;
  onPress?: () => void;
};

export function GluestackUIProvider({children}: ChildrenProps) {
  return <>{children}</>;
}

export function useColorMode() {
  return 'light';
}

export const Box = View;
export const Text = RNText;
export const ScrollView = RNScrollView;
export const Spinner = ActivityIndicator;
export const Pressable = RNPressable;

export function Button({children, isDisabled, onPress}: ButtonProps) {
  const title = React.Children.toArray(children)
    .map(child => {
      if (typeof child === 'string') {
        return child;
      }

      if (React.isValidElement<{children?: React.ReactNode}>(child)) {
        const childValue = child.props.children;
        if (typeof childValue === 'string') {
          return childValue;
        }
      }

      return '';
    })
    .join(' ')
    .trim();

  return (
    <RNButton
      disabled={isDisabled}
      onPress={onPress}
      title={title || 'Button'}
    />
  );
}

export const ButtonText = RNText;
export const ButtonSpinner = ActivityIndicator;

export function Input({children}: ChildrenProps) {
  return <View>{children}</View>;
}

export const InputField = TextInput;
