import {Box, Text} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

export function RecordScreen() {
  return (
    <Box style={styles.container}>
      <Text style={styles.placeholder}>todo</Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  placeholder: {
    fontSize: 16,
  },
});
