/**
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {clearUri, getSavedUri, saveUri} from '../src/core/storage/appStorage';
import {NOTES_DIRECTORY_URI_KEY} from '../src/core/storage/keys';

describe('appStorage', () => {
  const asyncStorageMock = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSavedUri reads from the notes directory key', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce('content://notes');

    await expect(getSavedUri()).resolves.toBe('content://notes');
    expect(asyncStorageMock.getItem).toHaveBeenCalledWith(
      NOTES_DIRECTORY_URI_KEY,
    );
  });

  test('saveUri stores trimmed URI', async () => {
    await saveUri('  content://notes  ');

    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      NOTES_DIRECTORY_URI_KEY,
      'content://notes',
    );
  });

  test('saveUri rejects empty URI', async () => {
    await expect(saveUri('   ')).rejects.toThrow(
      'Directory URI cannot be empty.',
    );
    expect(asyncStorageMock.setItem).not.toHaveBeenCalled();
  });

  test('clearUri removes the notes directory key', async () => {
    await clearUri();

    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(
      NOTES_DIRECTORY_URI_KEY,
    );
  });
});
