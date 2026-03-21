import {Box, Text} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

export function PodcastsScreen() {
  return (
    <Box style={styles.container}>
      <Text style={styles.title}>Podcasts</Text>
      <Text style={styles.description}>
        Podcast playback is coming in a future release. The native audio library
        requires New Architecture support before it can be integrated.
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
