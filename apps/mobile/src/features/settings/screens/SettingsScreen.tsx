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
  ScrollView,
  Text,
} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

import {buildNoteboxSettingsFromForm} from '@notebox/core';

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
  const {
    baseUri,
    clearDirectory,
    isSaving,
    localSettings,
    saveLocalSettings,
    saveSettings,
    settings,
  } = useSettings();
  const [displayName, setDisplayName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [r2Endpoint, setR2Endpoint] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const directoryLabel = baseUri ? getDirectoryLabel(baseUri) : 'No directory selected';

  useEffect(() => {
    const r2 = settings?.r2;
    setR2Endpoint(r2?.endpoint ?? '');
    setR2Bucket(r2?.bucket ?? '');
    setR2AccessKeyId(r2?.accessKeyId ?? '');
    setR2SecretAccessKey(r2?.secretAccessKey ?? '');
  }, [settings]);

  useEffect(() => {
    setDisplayName(localSettings?.displayName ?? '');
    setDeviceName(localSettings?.deviceName ?? '');
  }, [localSettings]);

  const handleSave = async () => {
    const shared = buildNoteboxSettingsFromForm({
      endpoint: r2Endpoint,
      bucket: r2Bucket,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    });

    if (!shared.ok) {
      setStatusText(shared.message);
      return;
    }

    setStatusText(null);

    try {
      await saveSettings(shared.settings);
      const trimmedDisplay = displayName.trim();
      await saveLocalSettings({
        deviceName: deviceName.trimEnd(),
        displayName: trimmedDisplay,
      });
      setDisplayName(trimmedDisplay);
      setDeviceName(deviceName.trimEnd());
      if (shared.settings.r2) {
        setR2Endpoint(shared.settings.r2.endpoint);
        setR2Bucket(shared.settings.r2.bucket);
        setR2AccessKeyId(shared.settings.r2.accessKeyId);
        setR2SecretAccessKey(shared.settings.r2.secretAccessKey);
      } else {
        setR2Endpoint('');
        setR2Bucket('');
        setR2AccessKeyId('');
        setR2SecretAccessKey('');
      }
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
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

        <Text style={styles.sectionTitle}>Vault (synced)</Text>
        <Text style={styles.hint}>Stored in .notebox/settings-shared.json in your vault.</Text>

        <Text style={styles.subsectionTitle}>Cloudflare R2 (optional)</Text>
        <Text testID="settings-r2-hint" style={styles.hint}>
          Values are read from your vault JSON—useful to confirm credentials synced with your copy of
          the vault. Leave all fields empty to clear R2 from shared settings.
        </Text>

        <Text style={styles.label}>Endpoint URL</Text>
        <Input style={styles.input}>
          <InputField
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setR2Endpoint}
            placeholder="https://accountid.r2.cloudflarestorage.com"
            value={r2Endpoint}
          />
        </Input>

        <Text style={styles.label}>Bucket</Text>
        <Input style={styles.input}>
          <InputField
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setR2Bucket}
            placeholder="Bucket name"
            value={r2Bucket}
          />
        </Input>

        <Text style={styles.label}>Access key ID</Text>
        <Input style={styles.input}>
          <InputField
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setR2AccessKeyId}
            secureTextEntry
            placeholder="Access key ID"
            value={r2AccessKeyId}
          />
        </Input>

        <Text style={styles.label}>Secret access key</Text>
        <Input style={styles.input}>
          <InputField
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setR2SecretAccessKey}
            secureTextEntry
            placeholder="Secret access key"
            value={r2SecretAccessKey}
          />
        </Input>

        <Text style={styles.sectionTitle}>This device</Text>
        <Text style={styles.hint}>Stored in .notebox/settings-local.json (not synced with Git by default).</Text>

        <Text style={styles.label}>Display name</Text>
        <Input style={styles.input}>
          <InputField
            onChangeText={setDisplayName}
            placeholder="Enter display name"
            testID="settings-display-name"
            value={displayName}
          />
        </Input>

        <Text style={styles.label}>Device name</Text>
        <Input style={styles.input}>
          <InputField
            onChangeText={setDeviceName}
            placeholder="e.g. Pixel, work laptop"
            value={deviceName}
          />
        </Input>

        <Text style={styles.securityNote}>
          R2 credentials are stored as plain JSON in your vault folder. That is acceptable for a
          private vault; do not publish or share the vault folder widely. A future version may use
          server-side auth instead of vault-stored secrets.
        </Text>

        <Box style={styles.actionsRow}>
          <Button
            borderRadius="$full"
            isDisabled={isSaving}
            onPress={handleSave}
            size="md"
            testID="settings-save-button">
            <ButtonText>Save changes</ButtonText>
          </Button>
        </Box>
        {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
      </Box>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    marginTop: 20,
  },
  changeLink: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  directoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  hint: {
    color: '#737373',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
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
  scrollContent: {
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 20,
  },
  securityNote: {
    color: '#737373',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
  statusText: {
    marginTop: 18,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
  },
  value: {
    flex: 1,
    marginRight: 12,
  },
});
