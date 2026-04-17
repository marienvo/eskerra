import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useLayoutEffect, useRef} from 'react';
import {Box, Text, useColorMode} from '@gluestack-ui/themed';
import {Platform, StyleSheet, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {eskerraVaultSearch} from '../../../native/eskerraVaultSearch';
import {VaultStackParamList} from '../../../navigation/types';
import {
  canonicalizeVaultBaseUriForSearch,
  fullNeedsRebuild,
  parseVaultSearchIndexStatus,
  shouldReconcile,
  VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION,
  vaultSearchBaseUriHash,
} from '../vaultSearchLifecycle';
import {NoteContentView} from '../components/NoteContentView';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

export function VaultScreen({navigation, route}: VaultScreenProps) {
  const {baseUri} = useVaultContext();
  const colorMode = useColorMode();
  const muted = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const indexRunRef = useRef<string | null>(null);

  const noteUri = route.params?.noteUri?.trim();
  const noteTitle = route.params?.noteTitle?.trim();
  const showingNote = Boolean(noteUri);

  const isVaultTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Vault';
  }, [navigation]);

  const renderSearchHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Search vault"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => navigation.navigate('VaultSearch')}
        style={styles.headerIconButton}>
        <MaterialIcons color="#ffffff" name="search" size={24} />
      </TouchableOpacity>
    ),
    [navigation],
  );

  const renderNoteBackHeaderLeft = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Close note"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          navigation.setParams({noteTitle: undefined, noteUri: undefined});
        }}
        style={styles.headerBackButton}>
        <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
      </TouchableOpacity>
    ),
    [navigation],
  );

  useLayoutEffect(() => {
    if (!isVaultTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    if (showingNote) {
      tabNavigation.setOptions({
        headerLeft: renderNoteBackHeaderLeft,
        headerRight: renderSearchHeaderRight,
        headerTitle: noteTitle && noteTitle.length > 0 ? noteTitle : 'Note',
      });
      return () => {
        tabNavigation.setOptions({
          headerLeft: undefined,
          headerRight: undefined,
          headerTitle: 'Vault',
        });
      };
    }

    tabNavigation.setOptions({
      headerLeft: undefined,
      headerRight: renderSearchHeaderRight,
      headerTitle: 'Vault',
    });
    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Vault',
      });
    };
  }, [
    isVaultTopRoute,
    navigation,
    noteTitle,
    renderNoteBackHeaderLeft,
    renderSearchHeaderRight,
    showingNote,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isVaultTopRoute()) {
          return;
        }
        tabNavigation.setOptions({
          headerShown: true,
          headerLeft: showingNote ? renderNoteBackHeaderLeft : undefined,
          headerRight: renderSearchHeaderRight,
          headerTitle:
            showingNote && noteTitle && noteTitle.length > 0 ? noteTitle : 'Vault',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      isVaultTopRoute,
      navigation,
      noteTitle,
      renderNoteBackHeaderLeft,
      renderSearchHeaderRight,
      showingNote,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !baseUri || !eskerraVaultSearch.isAvailable()) {
        return;
      }
      if (!isVaultTopRoute()) {
        return;
      }

      const runKey = baseUri;
      indexRunRef.current = runKey;
      let cancelled = false;

      (async () => {
        try {
          await eskerraVaultSearch.open(baseUri);
          if (cancelled || indexRunRef.current !== runKey) {
            return;
          }
          const full = parseVaultSearchIndexStatus(await eskerraVaultSearch.getIndexStatus(baseUri));
          if (cancelled || indexRunRef.current !== runKey || full == null) {
            return;
          }
          const canonical = baseUri;
          if (fullNeedsRebuild(full, canonical)) {
            const expectedHash = vaultSearchBaseUriHash(canonicalizeVaultBaseUriForSearch(canonical));
            let rebuildReason = 'missing';
            if (full.baseUriHash !== '' && full.baseUriHash !== expectedHash) {
              rebuildReason = 'base-uri-change';
            } else if (full.schemaVersion !== VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION) {
              rebuildReason = 'schema-mismatch';
            }
            await eskerraVaultSearch.scheduleFullRebuild(baseUri, rebuildReason);
            return;
          }
          if (shouldReconcile(full, Date.now())) {
            await eskerraVaultSearch.reconcile(baseUri);
          }
        } catch {
          // Best-effort index maintenance; ignore failures.
        }
      })().catch(() => undefined);

      return () => {
        cancelled = true;
      };
    }, [baseUri, isVaultTopRoute]),
  );

  return (
    <Box style={styles.container}>
      {showingNote && noteUri ? (
        <NoteContentView noteUri={noteUri} />
      ) : (
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          Open search to browse notes in this vault.
        </Text>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
  },
  headerBackButton: {
    marginLeft: 12,
  },
  headerIconButton: {
    marginRight: 12,
  },
});
