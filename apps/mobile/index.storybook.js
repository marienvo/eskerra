/**
 * @format
 * Storybook entry — run: npm run storybook:android -w @eskerra/mobile
 * (Metro serves this file when WITH_STORYBOOK=1; ENTRY_FILE is used for release bundles.)
 */
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import {AppRegistry} from 'react-native';

import {name as appName} from './app.json';
import StorybookUIRoot from './storybook';

AppRegistry.registerComponent(appName, () => StorybookUIRoot);
