import type {Meta, StoryObj} from '@storybook/react';

import {IconGlyph} from '../primitives/IconGlyph';

const meta: Meta<typeof IconGlyph> = {
  title: 'Primitives/IconGlyph',
  component: IconGlyph,
  args: {
    name: 'inbox',
    size: 24,
  },
};

export default meta;

type Story = StoryObj<typeof IconGlyph>;

export const Default: Story = {};

export const Large: Story = {
  args: {size: 48, name: 'settings'},
};
