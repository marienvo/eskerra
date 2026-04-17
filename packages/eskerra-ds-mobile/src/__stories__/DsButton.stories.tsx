import type {Meta, StoryObj} from '@storybook/react';
import {View} from 'react-native';

import {DsButton} from '../controls/DsButton';

const meta = {
  title: 'Controls/DsButton',
  component: DsButton,
  decorators: [
    (Story) => (
      <View style={{alignItems: 'flex-start'}}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof DsButton>;

export default meta;

type Story = StoryObj<typeof DsButton>;

export const Secondary: Story = {
  args: {children: 'Secondary', variant: 'secondary'},
};

export const Primary: Story = {
  args: {children: 'Primary', variant: 'primary'},
};

export const Disabled: Story = {
  args: {children: 'Disabled', disabled: true},
};

export const Loading: Story = {
  args: {children: 'Loading', loading: true, variant: 'primary'},
};
