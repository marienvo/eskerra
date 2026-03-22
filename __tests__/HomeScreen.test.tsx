/**
 * @format
 */

import {useNavigation} from '@react-navigation/native';
import {
  act,
  create,
  ReactTestRenderer,
} from 'react-test-renderer';
import {Button, TextInput} from 'react-native';

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
  const clearDirectoryMock = jest.fn();

  function getButtonByTitle(tree: ReactTestRenderer, title: string) {
    return tree.root.findAllByType(Button).find(button => button.props.title === title)!;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigationMock.mockReturnValue({navigate: navigateMock} as never);
    saveSettingsMock.mockResolvedValue(undefined);
    clearDirectoryMock.mockResolvedValue(undefined);
    useSettingsMock.mockReturnValue({
      baseUri: 'content://notes',
      clearDirectory: clearDirectoryMock,
      isSaving: false,
      saveSettings: saveSettingsMock,
      settings: {displayName: 'My Notebox'},
    });
  });

  test('loads current display name from settings hook', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(<SettingsScreen />);
    });

    const input = tree!.root.findByType(TextInput);
    expect(input.props.value).toBe('My Notebox');
  });

  test('saves trimmed displayName', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(<SettingsScreen />);
    });

    const input = tree!.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('  Team Notes  ');
    });

    const saveButton = getButtonByTitle(tree!, 'Save');
    await act(async () => {
      await saveButton.props.onPress();
    });

    expect(saveSettingsMock).toHaveBeenCalledWith({
      displayName: 'Team Notes',
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
