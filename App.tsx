/**
 * @format
 */

import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
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
import {reportUnexpectedError} from './src/core/observability/reportUnexpectedError';
import {VaultProvider} from './src/core/vault/VaultContext';
import {prepareVaultSession} from './src/core/vault/applyVaultSession';
import {RootNavigator} from './src/navigation/RootNavigator';
import {RootStackParamList} from './src/navigation/types';
import {clearUri} from './src/core/storage/appStorage';
import {readPlaylistCoalesced} from './src/core/storage/noteboxStorage';
import {setPodcastBootstrapPayload} from './src/features/podcasts/services/podcastBootstrapCache';
import {runPodcastPhase1} from './src/features/podcasts/services/podcastPhase1';
import {NoteSummary, NoteboxSettings} from './src/types';
import {appBreadcrumb} from './src/core/observability/appBreadcrumb';
import {elapsedMsSinceJsBundleEval} from './src/core/observability/startupTiming';

type InitialRoute = keyof RootStackParamList;

type VaultInitialSession = {
  uri: string;
  settings: NoteboxSettings;
  inboxPrefetch: NoteSummary[] | null;
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);
  const [initialSession, setInitialSession] = useState<VaultInitialSession | null>(null);

  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      try {
        const {route, savedUri} = await resolveInitialRoute();
        if (isActive) {
          if (route === 'MainTabs' && savedUri) {
            appBreadcrumb({
              category: 'app',
              message: 'bootstrap.vault_preload.start',
              data: {
                elapsed_ms: elapsedMsSinceJsBundleEval(),
              },
            });

            const vaultPreloadPromise = prepareVaultSession(savedUri);
            const playlistPrimePromise = readPlaylistCoalesced(savedUri)
              .then(entry => {
                appBreadcrumb({
                  category: 'app',
                  message: 'bootstrap.playlist_prime.complete',
                  data: {
                    has_playlist: Boolean(entry),
                    elapsed_ms: elapsedMsSinceJsBundleEval(),
                  },
                });
                return entry;
              })
              .catch(error => {
                reportUnexpectedError(error, {flow: 'app_bootstrap', step: 'playlist_prime'});
                return null;
              });
            appBreadcrumb({
              category: 'app',
              message: 'bootstrap.podcast_phase1.start',
              data: {
                elapsed_ms: elapsedMsSinceJsBundleEval(),
              },
            });

            const podcastPhase1Promise = runPodcastPhase1(savedUri)
              .then(phase1 => {
                setPodcastBootstrapPayload(savedUri, {
                  allEpisodes: phase1.allEpisodes,
                  didFullVaultListingThisRefresh: phase1.didFullVaultListingThisRefresh,
                  error: phase1.error,
                  podcastRelevantFiles: phase1.podcastRelevantFiles,
                  rssFeedFiles: phase1.rssFeedFiles,
                  sections: phase1.sections,
                });
                appBreadcrumb({
                  category: 'app',
                  message: 'bootstrap.podcast_phase1.complete',
                  data: {
                    elapsed_ms: elapsedMsSinceJsBundleEval(),
                    episode_count: phase1.allEpisodes.length,
                    has_error: Boolean(phase1.error),
                  },
                });
                return phase1;
              })
              .catch(error => {
                reportUnexpectedError(error, {flow: 'app_bootstrap', step: 'podcast_phase1'});
                setPodcastBootstrapPayload(savedUri, {
                  allEpisodes: [],
                  didFullVaultListingThisRefresh: false,
                  error: 'Could not load podcasts from vault.',
                  podcastRelevantFiles: [],
                  rssFeedFiles: [],
                  sections: [],
                });
                return null;
              });

            const [prepared] = await Promise.all([
              vaultPreloadPromise,
              playlistPrimePromise,
              podcastPhase1Promise,
            ]);

            const initial: VaultInitialSession = {
              uri: savedUri,
              settings: prepared.settings,
              inboxPrefetch: prepared.inboxPrefetch,
            };

            setInitialSession(initial);
            appBreadcrumb({
              category: 'app',
              message: 'bootstrap.vault_preload.complete',
              data: {
                elapsed_ms: elapsedMsSinceJsBundleEval(),
              },
            });
          }

          setInitialRoute(route);
        }
      } catch (error) {
        reportUnexpectedError(error, {flow: 'app_bootstrap', step: 'resolve_initial_route'});
        await clearUri();
        if (isActive) {
          setInitialSession(null);
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
            <View
              style={[
                styles.loadingContainer,
                isDarkMode ? styles.loadingContainerDark : styles.loadingContainerLight,
              ]}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Notebox"
                resizeMode="contain"
                source={require('./src/assets/notebox-logo.png')}
                style={styles.startupLogo}
              />
              <ActivityIndicator color={isDarkMode ? '#ffffff' : '#333333'} style={styles.startupSpinner} />
            </View>
          ) : (
            <VaultProvider initialSession={initialSession}>
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
  loadingContainerDark: {
    backgroundColor: '#121212',
  },
  loadingContainerLight: {
    backgroundColor: '#f5f5f5',
  },
  startupLogo: {
    height: 120,
    width: 120,
  },
  startupSpinner: {
    marginTop: 24,
  },
});

export default App;
