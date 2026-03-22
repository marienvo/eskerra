import {Box, Text} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

import {useVaultContext} from '../../../core/vault/VaultContext';

export function HomeScreen() {
  const {settings} = useVaultContext();

  return (
    <Box style={styles.container}>
      <Text style={styles.subtitle}>
        {settings?.displayName ?? 'Notebox'}
      </Text>
      <Text style={styles.description}>
        Inbox for fast capture, Vault for your full note collection.
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  description: {
    marginTop: 10,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
  },
});
