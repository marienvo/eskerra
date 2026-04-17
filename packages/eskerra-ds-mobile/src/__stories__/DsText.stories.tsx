import type {Meta, StoryObj} from '@storybook/react';
import {View} from 'react-native';

import {DsText} from '../primitives/DsText';

const meta = {
  title: 'Primitives/DsText',
  component: DsText,
  decorators: [
    (Story) => (
      <View style={{gap: 8}}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof DsText>;

export default meta;

type Story = StoryObj<typeof DsText>;

export const Body: Story = {
  args: {variant: 'body', children: 'Body copy aligned with calm editorial tokens.'},
};

export const Muted: Story = {
  args: {variant: 'muted', children: 'Muted secondary line.'},
};

export const Title: Story = {
  args: {variant: 'title', children: 'Section title'},
};
