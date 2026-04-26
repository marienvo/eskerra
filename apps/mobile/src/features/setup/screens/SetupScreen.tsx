import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useState} from 'react';
import {
  Box,
  Button,
  ButtonSpinner,
  ButtonText,
  Text,
} from '@gluestack-ui/themed';
import {Platform, StyleSheet} from 'react-native';
import {RootStackParamList} from '../../../navigation/types';
import {openAndroidVaultDirectoryPicker} from '../../../core/storage/openAndroidDocumentTree';
import {saveUri} from '../../../core/storage/appStorage';
import {initEskerra} from '../../../core/storage/eskerraStorage';
import {useVaultContext} from '../../../core/vault/VaultContext';

type SetupNavigation = StackNavigationProp<RootStackParamList, 'Setup'>;

export function SetupScreen() {
  const navigation = useNavigation<SetupNavigation>();
  const {setSessionUri} = useVaultContext();
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAndroid = Platform.OS === 'android';

  const handleChooseDirectory = async () => {
    if (!isAndroid || isSubmitting) {
      return;
    }

    setStatusText(null);
    setIsSubmitting(true);

    try {
      const selectedDirectory = await openAndroidVaultDirectoryPicker();

      if (!selectedDirectory?.uri) {
        setStatusText('Selection canceled.');
        return;
      }

      await saveUri(selectedDirectory.uri);
      await initEskerra(selectedDirectory.uri);
      await setSessionUri(selectedDirectory.uri);
      navigation.replace('MainTabs', {screen: 'VaultTab'});
    } catch (error) {
      const fallbackMessage =
        'Could not save this directory. Please try again.';
      setStatusText(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.title}>Set up Eskerra</Text>
      <Text style={styles.description}>
        Choose the directory where Eskerra can store app settings and entries.
      </Text>
      {!isAndroid ? (
        <Text style={styles.statusText}>
          Directory selection is currently supported on Android only.
        </Text>
      ) : null}
      <Box style={styles.buttonRow}>
        <Button
          borderRadius="$full"
          isDisabled={!isAndroid || isSubmitting}
          onPress={handleChooseDirectory}
          size="md">
          {isSubmitting ? <ButtonSpinner /> : null}
          <ButtonText>Choose Entries Directory</ButtonText>
        </Button>
      </Box>
      {isSubmitting ? <ButtonSpinner style={styles.spinner} /> : null}
      {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    marginTop: 20,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    marginTop: 12,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 16,
  },
  statusText: {
    marginTop: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
});
