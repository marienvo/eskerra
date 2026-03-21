import {useNavigation} from '@react-navigation/native';
import {NavigationProp} from '@react-navigation/native';
import {useEffect, useState} from 'react';
import {
  Box,
  Button,
  ButtonText,
  Input,
  InputField,
  Text,
} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

import {RootStackParamList} from '../../../navigation/types';
import {useSettings} from '../hooks/useSettings';

type SettingsNavigation = NavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const {baseUri, clearDirectory, isSaving, saveSettings, settings} =
    useSettings();
  const [displayName, setDisplayName] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);

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
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>Selected directory</Text>
      <Text numberOfLines={2} style={styles.value}>
        {baseUri ?? 'No directory selected'}
      </Text>

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
      <Box style={styles.actionsRow}>
        <Button
          borderRadius="$full"
          isDisabled={isSaving}
          onPress={handleChangeDirectory}
          size="md"
          variant="outline">
          <ButtonText>Change directory</ButtonText>
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
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  value: {
    marginTop: 6,
  },
});
