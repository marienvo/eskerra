import type {Meta, StoryObj} from '@storybook/react';

import {DsSurface} from '../primitives/DsSurface';
import {DsText} from '../primitives/DsText';

const meta: Meta<typeof DsSurface> = {
  title: 'Primitives/DsSurface',
  component: DsSurface,
};

export default meta;

type Story = StoryObj<typeof DsSurface>;

export const Default: Story = {
  render: () => (
    <DsSurface style={{maxWidth: 320}}>
      <DsText variant="title">Surface</DsText>
      <DsText variant="body">Panel body uses surface + border tokens.</DsText>
    </DsSurface>
  ),
};
