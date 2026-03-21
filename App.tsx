/**
 * @format
 */

import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import {GluestackUIProvider} from '@gluestack-ui/themed';
import {config} from '@gluestack-ui/config';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {resolveInitialRoute} from './src/core/bootstrap/resolveInitialRoute';
import {VaultProvider} from './src/core/vault/VaultContext';
import {RootNavigator} from './src/navigation/RootNavigator';
import {RootStackParamList} from './src/navigation/types';
import {clearUri} from './src/core/storage/appStorage';

type InitialRoute = keyof RootStackParamList;

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);

  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      try {
        const route = await resolveInitialRoute();
        if (isActive) {
          setInitialRoute(route);
        }
      } catch {
        await clearUri();
        if (isActive) {
          setInitialRoute('Setup');
        }
      }
    };

    bootstrap().catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <GluestackUIProvider colorMode={isDarkMode ? 'dark' : 'light'} config={config}>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          {initialRoute === null ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <VaultProvider>
              <RootNavigator initialRouteName={initialRoute} />
            </VaultProvider>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </GluestackUIProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export default App;
