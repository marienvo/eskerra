import type {Preview} from '@storybook/react';

import '@eskerra/tokens/desktop-root.css';

const preview: Preview = {
  parameters: {
    a11y: {
      config: {
        rules: [{id: 'color-contrast', enabled: true}],
      },
    },
  },
};

export default preview;
