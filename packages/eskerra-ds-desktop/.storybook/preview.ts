import type {Preview} from '@storybook/react';

import '@eskerra/tokens/desktop-root.css';
import 'material-icons/iconfont/filled.css';

const preview: Preview = {
  parameters: {
    controls: {expanded: true},
    a11y: {
      config: {
        rules: [{id: 'color-contrast', enabled: true}],
      },
    },
    backgrounds: {default: 'capture'},
  },
  initialGlobals: {
    backgrounds: {value: 'capture'},
  },
};

export default preview;
