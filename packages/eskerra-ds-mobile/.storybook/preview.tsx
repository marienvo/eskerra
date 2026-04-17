import type {Preview} from '@storybook/react';
import {View} from 'react-native';

import {rnColors} from '@eskerra/tokens';

const preview: Preview = {
  decorators: [
    (Story) => (
      <View style={{flex: 1, backgroundColor: rnColors.background, padding: 16}}>
        <Story />
      </View>
    ),
  ],
};

export default preview;
