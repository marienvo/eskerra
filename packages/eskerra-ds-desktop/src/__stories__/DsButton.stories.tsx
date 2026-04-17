import type {Meta, StoryObj} from '@storybook/react';
import {expect, fn, userEvent, within} from '@storybook/test';

import {DsButton} from '../controls/DsButton';

const meta: Meta<typeof DsButton> = {
  title: 'Controls/DsButton',
  component: DsButton,
  args: {
    children: 'Action',
  },
};

export default meta;

type Story = StoryObj<typeof DsButton>;

export const Default: Story = {
  args: {variant: 'secondary'},
};

export const Primary: Story = {
  args: {variant: 'primary'},
};

export const Disabled: Story = {
  args: {disabled: true, children: 'Disabled'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', {name: 'Disabled'});
    await expect(btn).toBeDisabled();
  },
};

export const ClicksWhenEnabled: Story = {
  args: {
    children: 'Click me',
    onClick: fn(),
  },
  play: async ({args, canvasElement}) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', {name: /click me/i});
    await expect(btn).toBeEnabled();
    await userEvent.click(btn);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
