import {useNavigation} from '@react-navigation/native';
import {NavigationProp} from '@react-navigation/native';
import {useEffect, useState} from 'react';
import {
  Box,
  Button,
  ButtonText,
  Input,
  InputField,
  Pressable,
  Text,
} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

import {RootStackParamList} from '../../../navigation/types';
import {useSettings} from '../hooks/useSettings';

type SettingsNavigation = NavigationProp<RootStackParamList>;

function getDirectoryLabel(uri: string): string {
  const decodedUri = decodeURIComponent(uri);
  const treeMatch = decodedUri.match(/tree\/([^/]+)/);
  const treeValue = treeMatch?.[1] ?? decodedUri;
  const [, pathValue = ''] = treeValue.split(':');
  const pathSegments = pathValue.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    return 'Internal Storage';
  }

  return pathSegments[pathSegments.length - 1];
}

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const {baseUri, clearDirectory, isSaving, saveSettings, settings} =
    useSettings();
  const [displayName, setDisplayName] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const directoryLabel = baseUri ? getDirectoryLabel(baseUri) : 'No directory selected';

  useEffect(() => {
    setDisplayName(settings?.displayName ?? '');
  }, [settings?.displayName]);

  const handleSave = async () => {
    const trimmedDisplayName = displayName.trim();

    if (!trimmedDisplayName) {
      setStatusText('Display name cannot be empty.');
      return;
    }

    setStatusText(null);

    try {
      await saveSettings({displayName: trimmedDisplayName});
      setDisplayName(trimmedDisplayName);
      setStatusText('Settings saved.');
    } catch (error) {
      const fallbackMessage = 'Could not save settings. Please try again.';
      setStatusText(error instanceof Error ? error.message : fallbackMessage);
    }
  };

  const handleChangeDirectory = async () => {
    setStatusText(null);

    try {
      await clearDirectory();
      navigation.navigate('Setup');
    } catch (error) {
      const fallbackMessage =
        'Could not clear the directory selection. Please try again.';
      setStatusText(error instanceof Error ? error.message : fallbackMessage);
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.label}>Selected directory</Text>
      <Box style={styles.directoryRow}>
        <Text numberOfLines={1} style={styles.value}>
          {directoryLabel}
        </Text>
        <Pressable
          disabled={isSaving}
          onPress={handleChangeDirectory}
          testID="change-directory-link">
          <Text style={styles.changeLink}>Change</Text>
        </Pressable>
      </Box>

      <Text style={styles.label}>Display name</Text>
      <Input style={styles.input}>
        <InputField
          onChangeText={setDisplayName}
          placeholder="Enter display name"
          value={displayName}
        />
      </Input>

      <Box style={styles.actionsRow}>
        <Button
          borderRadius="$full"
          isDisabled={isSaving}
          onPress={handleSave}
          size="md">
          <ButtonText>Save</ButtonText>
        </Button>
      </Box>
      {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    marginTop: 16,
  },
  changeLink: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  directoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  input: {
    borderRadius: 12,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  label: {
    fontWeight: '600',
    marginTop: 10,
  },
  statusText: {
    marginTop: 18,
  },
  value: {
    flex: 1,
    marginRight: 12,
  },
});
