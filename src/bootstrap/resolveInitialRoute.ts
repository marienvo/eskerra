import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {hasPermission} from 'react-native-saf-x';

import {NOTES_DIRECTORY_URI_KEY} from '../storage/keys';

export type InitialRoute = 'Home' | 'Setup';

export async function resolveInitialRoute(): Promise<InitialRoute> {
  const savedUri = await AsyncStorage.getItem(NOTES_DIRECTORY_URI_KEY);

  if (!savedUri) {
    return 'Setup';
  }

  // SAF permissions are Android-only in this MVP.
  if (Platform.OS !== 'android') {
    return 'Home';
  }

  const permissionGranted = await hasPermission(savedUri);

  if (!permissionGranted) {
    await AsyncStorage.removeItem(NOTES_DIRECTORY_URI_KEY);
    return 'Setup';
  }

  return 'Home';
}
