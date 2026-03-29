import 'react-native-gesture-handler';
import 'react-native-reanimated';
/**
 * @format
 */

import './src/core/observability/startupTiming';
import './src/core/observability/registerSentry';

import {AppRegistry} from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import {name as appName} from './app.json';
import {playbackService} from './src/features/podcasts/services/playbackService';

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => playbackService);
