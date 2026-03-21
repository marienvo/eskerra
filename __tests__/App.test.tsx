/**
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {hasPermission} from 'react-native-saf-x';

import {resolveInitialRoute} from '../src/bootstrap/resolveInitialRoute';
import {NOTES_DIRECTORY_URI_KEY} from '../src/storage/keys';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('react-native-saf-x', () => ({
  hasPermission: jest.fn(),
}));

function setPlatformOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

describe('resolveInitialRoute', () => {
  const asyncStorageMock = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const hasPermissionMock = hasPermission as jest.MockedFunction<
    typeof hasPermission
  >;
  const initialPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOs('android');
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: initialPlatform,
    });
  });

  test('returns Setup when no URI is saved', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce(null);

    await expect(resolveInitialRoute()).resolves.toBe('Setup');
    expect(hasPermissionMock).not.toHaveBeenCalled();
  });

  test('returns Home when URI exists and permission is valid', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce('content://test-uri');
    hasPermissionMock.mockResolvedValueOnce(true);

    await expect(resolveInitialRoute()).resolves.toBe('Home');
    expect(hasPermissionMock).toHaveBeenCalledWith('content://test-uri');
    expect(asyncStorageMock.removeItem).not.toHaveBeenCalled();
  });

  test('clears URI and returns Setup when permission is invalid', async () => {
    asyncStorageMock.getItem.mockResolvedValueOnce('content://test-uri');
    hasPermissionMock.mockResolvedValueOnce(false);

    await expect(resolveInitialRoute()).resolves.toBe('Setup');
    expect(hasPermissionMock).toHaveBeenCalledWith('content://test-uri');
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(
      NOTES_DIRECTORY_URI_KEY,
    );
  });
});
