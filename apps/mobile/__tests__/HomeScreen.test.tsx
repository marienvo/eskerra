/**
 * @format
 */

import {useNavigation} from '@react-navigation/native';
import {
  act,
  create,
  ReactTestRenderer,
} from 'react-test-renderer';

import {SettingsScreen} from '../src/features/settings/screens/SettingsScreen';
import {useSettings} from '../src/features/settings/hooks/useSettings';

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

jest.mock('../src/features/settings/hooks/useSettings', () => ({
  useSettings: jest.fn(),
}));

describe('SettingsScreen', () => {
  const navigateMock = jest.fn();
  const useNavigationMock = useNavigation as jest.MockedFunction<
    typeof useNavigation
  >;
  const useSettingsMock = useSettings as jest.MockedFunction<typeof useSettings>;
  const saveSettingsMock = jest.fn();
  const saveLocalSettingsMock = jest.fn();
  const clearDirectoryMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigationMock.mockReturnValue({navigate: navigateMock} as never);
    saveSettingsMock.mockResolvedValue(undefined);
    saveLocalSettingsMock.mockResolvedValue(undefined);
    clearDirectoryMock.mockResolvedValue(undefined);
    useSettingsMock.mockReturnValue({
      baseUri: 'content://notes',
      clearDirectory: clearDirectoryMock,
      isSaving: false,
      localSettings: {
        deviceInstanceId: 'test-device',
        deviceName: '',
        displayName: 'My Eskerra',
        playlistKnownControlRevision: null,
        playlistKnownUpdatedAtMs: null,
      },
      saveLocalSettings: saveLocalSettingsMock,
      saveSettings: saveSettingsMock,
      settings: {},
    });
  });

  test('loads current display name from settings hook', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(<SettingsScreen />);
    });

    const input = tree!.root.findByProps({testID: 'settings-display-name'});
    expect(input.props.value).toBe('My Eskerra');
  });

  test('saves trimmed displayName and device name', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(<SettingsScreen />);
    });

    const input = tree!.root.findByProps({testID: 'settings-display-name'});
    await act(async () => {
      input.props.onChangeText('  Team Notes  ');
    });

    const saveButton = tree!.root.findByProps({testID: 'settings-save-button'});
    await act(async () => {
      await saveButton.props.onPress();
    });

    expect(saveSettingsMock).toHaveBeenCalledWith({});
    expect(saveLocalSettingsMock).toHaveBeenCalledWith({
      deviceInstanceId: 'test-device',
      deviceName: '',
      displayName: 'Team Notes',
      playlistKnownControlRevision: null,
      playlistKnownUpdatedAtMs: null,
    });
  });

  test('clears URI and returns to setup', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(<SettingsScreen />);
    });

    const changeDirectoryButton = tree!.root.findByProps({
      testID: 'change-directory-link',
    });
    await act(async () => {
      await changeDirectoryButton.props.onPress();
    });

    expect(clearDirectoryMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('Setup');
  });
});
