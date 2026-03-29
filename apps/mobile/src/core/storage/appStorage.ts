import AsyncStorage from '@react-native-async-storage/async-storage';

import {NOTES_DIRECTORY_URI_KEY} from './keys';

const isDevMockVaultEnabled =
  __DEV__ &&
  !(globalThis as {process?: {env?: Record<string, string | undefined>}}).process
    ?.env?.JEST_WORKER_ID;

function getDevStorage() {
  return require('../../dev/devStorage') as typeof import('../../dev/devStorage');
}

export async function getSavedUri(): Promise<string | null> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.getSavedUri();
  }

  return AsyncStorage.getItem(NOTES_DIRECTORY_URI_KEY);
}

export async function saveUri(uri: string): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.saveUri(uri);
    return;
  }

  const normalizedUri = uri.trim();

  if (!normalizedUri) {
    throw new Error('Directory URI cannot be empty.');
  }

  await AsyncStorage.setItem(NOTES_DIRECTORY_URI_KEY, normalizedUri);
}

export async function clearUri(): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.clearUri();
  }

  await AsyncStorage.removeItem(NOTES_DIRECTORY_URI_KEY);
}
