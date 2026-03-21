import {StyleSheet, Text, View} from 'react-native';

export function SetupScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setup Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
});
