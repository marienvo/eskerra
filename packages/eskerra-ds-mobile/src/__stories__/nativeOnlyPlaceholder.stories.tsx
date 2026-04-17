import type {Meta, StoryObj} from '@storybook/react';
import {Text, View} from 'react-native';

/**
 * Example of a story that must not run on RN-Web (gestures, Reanimated, etc.).
 * Web test-runner skips via `tags: ['native-only']` in `.storybook-web/test-runner.ts`.
 */
const meta = {
  title: 'NativeOnly/Placeholder',
  component: View,
  tags: ['native-only'],
} satisfies Meta<typeof View>;

export default meta;

type Story = StoryObj<typeof View>;

export const SkippedOnWeb: Story = {
  render: () => (
    <View>
      <Text>On-device Storybook only</Text>
    </View>
  ),
};
