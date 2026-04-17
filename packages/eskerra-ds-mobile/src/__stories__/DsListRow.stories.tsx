import type {Meta, StoryObj} from '@storybook/react';
import {View} from 'react-native';

import {DsListRow} from '../list/DsListRow';

const meta = {
  title: 'List/DsListRow',
  component: DsListRow,
  decorators: [
    (Story) => (
      <View style={{alignSelf: 'stretch'}}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof DsListRow>;

export default meta;

type Story = StoryObj<typeof DsListRow>;

export const Single: Story = {
  args: {title: 'Inbox', subtitle: '3 items'},
};
