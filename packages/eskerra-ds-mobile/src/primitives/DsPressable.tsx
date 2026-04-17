import type {PressableProps} from 'react-native';
import {Pressable} from 'react-native';

export type DsPressableProps = PressableProps;

export function DsPressable(props: DsPressableProps) {
  return <Pressable accessibilityRole="button" {...props} />;
}
