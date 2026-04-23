import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import React, {useCallback, useEffect, useState} from 'react';
import {
  Box,
  Input,
  InputField,
  Pressable,
  Spinner,
  Text,
  useColorMode,
} from '@gluestack-ui/themed';
import {FlatList, StyleSheet, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {
  compareVaultSearchNotes,
  vaultSearchHighlightSegments,
} from '@eskerra/core';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {eskerraVaultSearch} from '../../../native/eskerraVaultSearch';
import {VaultStackParamList} from '../../../navigation/types';
import {useVaultContentSearch} from '../hooks/useVaultContentSearch';
import {runVaultSearchIndexMaintenance} from '../vaultSearchIndexMaintenance';

type Props = StackScreenProps<VaultStackParamList, 'VaultSearch'>;

type SearchVaultHeaderBackButtonProps = {
  onPress: () => void;
};

function SearchVaultHeaderBackButton({onPress}: SearchVaultHeaderBackButtonProps) {
  return (
    <TouchableOpacity
      accessibilityLabel="Close search"
      hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
      onPress={onPress}
      style={styles.headerIcon}>
      <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
    </TouchableOpacity>
  );
}

export function VaultSearchScreen({navigation}: Props) {
  const {baseUri} = useVaultContext();
  const [vaultInstanceId, setVaultInstanceId] = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [bodiesIndexReady, setBodiesIndexReady] = useState(true);
  const [lastReconciledAt, setLastReconciledAt] = useState<number | null>(null);
  const [hookOpen, setHookOpen] = useState(true);
  /** True until the fast native `open()` returns so the search hook can pin `vaultInstanceId` before maintenance finishes. */
  const [searchIndexOpening, setSearchIndexOpening] = useState(false);
  /** Full maintenance (open + status + optional reconcile) still in flight after bootstrap `open`. */
  const [indexMaintenancePending, setIndexMaintenancePending] = useState(false);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderHeaderLeft = useCallback(
    () => <SearchVaultHeaderBackButton onPress={goBack} />,
    [goBack],
  );

  /** Pin vault instance + flags as soon as native has opened the DB — do not block first search on full maintenance. */
  useEffect(() => {
    let cancelled = false;
    if (!baseUri || !eskerraVaultSearch.isAvailable()) {
      setSearchIndexOpening(false);
      return;
    }
    setSearchIndexOpening(true);
    eskerraVaultSearch
      .open(baseUri.trim())
      .then(st => {
        if (cancelled) {
          return;
        }
        if (st.vaultInstanceId) {
          setVaultInstanceId(prev => prev ?? st.vaultInstanceId);
        }
        setIndexReady(prev => prev || st.indexReady);
        if (st.bodiesIndexReady === false) {
          setBodiesIndexReady(false);
        }
        setLastReconciledAt(prev =>
          prev == null || !Number.isFinite(prev) ? st.lastReconciledAt : prev,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setSearchIndexOpening(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [baseUri]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!baseUri || !eskerraVaultSearch.isAvailable()) {
          setIndexMaintenancePending(false);
          return;
        }
        setIndexMaintenancePending(true);
        const st = await runVaultSearchIndexMaintenance(baseUri);
        if (cancelled) {
          return;
        }
        if (st == null) {
          setVaultInstanceId(null);
          return;
        }
        setVaultInstanceId(st.vaultInstanceId);
        setIndexReady(st.indexReady);
        setBodiesIndexReady(st.bodiesIndexReady !== false);
        setLastReconciledAt(st.lastReconciledAt);
      } catch {
        if (!cancelled) {
          setVaultInstanceId(null);
        }
      } finally {
        if (!cancelled) {
          setIndexMaintenancePending(false);
        }
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [baseUri]);

  const retryFullRebuild = useCallback(() => {
    if (!baseUri || !eskerraVaultSearch.isAvailable()) {
      return;
    }
    eskerraVaultSearch.scheduleFullRebuild(baseUri, 'manual-retry').catch(() => undefined);
  }, [baseUri]);

  useFocusEffect(
    useCallback(() => {
      setHookOpen(true);
      const tabNav = navigation.getParent();
      if (tabNav) {
        tabNav.setOptions({
          headerShown: true,
          headerTitle: 'Search vault',
          headerLeft: renderHeaderLeft,
          headerRight: undefined,
        });
      }
      return () => {
        setHookOpen(false);
        eskerraVaultSearch.cancel().catch(() => undefined);
        // Do not reset the parent tab header here: VaultScreen reapplies the Today hub header on
        // focus. Clearing to a plain "Today" races with VaultScreen and drops the hub switcher/search.
      };
    }, [navigation, renderHeaderLeft]),
  );

  const {
    query,
    setQuery,
    notes,
    progress,
    scanDone,
    awaitingDebouncedRun,
    searchingStatusVisible,
    indexStatusLive,
    indexProgress,
    partialBodiesIndexing,
  } = useVaultContentSearch({
    open: hookOpen,
    baseUri,
    vaultInstanceId,
    indexReady,
    lastReconciledAt,
    bodiesIndexReadyFromOpen: bodiesIndexReady,
  });

  const colorMode = useColorMode();
  const muted = colorMode === 'dark' ? '#cfcfcf' : '#616161';

  const trimmed = query.trim();
  const sortedNotes =
    notes.length <= 1 ? notes : [...notes].sort(compareVaultSearchNotes);

  const onPick = useCallback(
    (uri: string, title: string) => {
      // Push on top of VaultSearch so back from the reader returns here with query + results intact.
      navigation.navigate('VaultNoteRead', {noteUri: uri, noteTitle: title});
    },
    [navigation],
  );

  const indexHint =
    progress != null && !progress.indexReady
      ? ` · index ${progress.indexStatus}`
      : '';
  const indexUsableForSearch =
    indexReady &&
    indexStatusLive?.status !== 'building' &&
    !(progress?.isBuilding === true && progress.indexReady !== true);

  const heavyIndexingHint =
    indexStatusLive?.status === 'building' ||
    (progress?.isBuilding === true && progress.indexReady !== true) ||
    (indexProgress != null && (indexProgress.phase === 'titles' || indexProgress.phase === 'bodies'));

  /** Full rebuild / title phase — block empty-state on “not ready” copy. */
  const indexingHint = heavyIndexingHint || bodiesIndexReady === false;

  const backgroundIndexRefresh =
    indexMaintenancePending && indexUsableForSearch && !heavyIndexingHint && trimmed.length > 0;

  const indexProgressLabel =
    indexProgress != null
      ? `Building search index (${indexProgress.phase})… ${indexProgress.processed} / ${indexProgress.total}`
      : indexStatusLive?.indexedNotes != null
        ? `Building search index… (${indexStatusLive.indexedNotes} notes)`
        : 'Building search index…';

  const statusLine =
    trimmed.length === 0
      ? null
      : searchIndexOpening || (vaultInstanceId == null && !scanDone)
        ? 'Opening search index…'
      : backgroundIndexRefresh
        ? 'Updating search index in the background…'
      : !scanDone && searchingStatusVisible
        ? progress != null
          ? `Searching… · ${progress.totalHits} notes${indexHint}`
          : 'Searching…'
        : awaitingDebouncedRun
          ? progress != null
            ? `${progress.totalHits} notes found`
            : null
          : progress != null
            ? `${progress.totalHits} notes found${indexHint}`
            : null;

  return (
    <Box style={styles.container}>
      <Box style={styles.inputRow}>
        <Input variant="outline" style={styles.input}>
          <InputField
            testID="vault-search-input"
            autoFocus
            placeholder="Search note contents…"
            placeholderTextColor={muted}
            value={query}
            onChangeText={setQuery}
          />
        </Input>
        {query.length > 0 ? (
          <Pressable accessibilityLabel="Clear" onPress={() => setQuery('')} style={styles.clearBtn}>
            <MaterialIcons color={muted} name="close" size={22} />
          </Pressable>
        ) : null}
      </Box>
      {statusLine != null ? <Text style={[styles.status, {color: muted}]}>{statusLine}</Text> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={sortedNotes}
        keyExtractor={item => item.uri}
        ListEmptyComponent={
          trimmed.length === 0 ? (
            <Text style={[styles.hint, {color: muted}]}>Type to search markdown in the vault.</Text>
          ) : scanDone && !awaitingDebouncedRun && notes.length === 0 ? (
            indexStatusLive?.status === 'error' ? (
              <Box style={styles.hintCol}>
                <Text style={[styles.hint, {color: muted}]}>Indexing failed.</Text>
                <Pressable
                  accessibilityLabel="Retry indexing"
                  onPress={retryFullRebuild}
                  testID="vault-search-retry-indexing">
                  <Text style={[styles.retryLink, {color: muted}]}>Retry</Text>
                </Pressable>
              </Box>
            ) : indexingHint ? (
              <Text style={[styles.hint, {color: muted}]}>{indexProgressLabel}</Text>
            ) : (
              <Text style={[styles.hint, {color: muted}]}>
                {progress != null && !progress.indexReady
                  ? 'Search index not ready on this device yet — try again in a moment.'
                  : 'No matches.'}
              </Text>
            )
          ) : !scanDone ? (
            <Box style={styles.hintCol}>
              {(searchIndexOpening || vaultInstanceId == null) && trimmed.length > 0 ? (
                <Text style={[styles.hint, {color: muted}]}>Opening search index…</Text>
              ) : null}
              <Spinner style={styles.spinner} />
            </Box>
          ) : null
        }
        renderItem={({item}) => {
          const sn = item.snippets[0];
          const preview = sn?.text ?? '';
          const rel = item.relativePath;
          return (
            <Pressable
              onPress={() => onPick(item.uri, item.title || rel)}
              style={[styles.row, {borderBottomColor: muted}]}>
              <Text style={styles.title}>
                {vaultSearchHighlightSegments(item.title || rel, trimmed).map((seg, i) => (
                  <Text
                    key={i}
                    style={seg.highlighted ? styles.highlight : undefined}>
                    {seg.text}
                  </Text>
                ))}
              </Text>
              <Text numberOfLines={1} style={[styles.rel, {color: muted}]}>
                {vaultSearchHighlightSegments(rel, trimmed).map((seg, i) => (
                  <Text
                    key={i}
                    style={seg.highlighted ? styles.highlight : undefined}>
                    {seg.text}
                  </Text>
                ))}
              </Text>
              {preview.length > 0 ? (
                <Text numberOfLines={2} style={[styles.snippet, {color: muted}]}>
                  {sn?.lineNumber != null && sn.lineNumber > 0 ? `${sn.lineNumber} · ` : null}
                  {vaultSearchHighlightSegments(preview, trimmed).map((seg, i) => (
                    <Text
                      key={i}
                      style={seg.highlighted ? styles.highlight : undefined}>
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
      {trimmed.length > 0 && partialBodiesIndexing ? (
        <Text style={[styles.footerHint, {color: muted}]}>
          Some notes are still being indexed for full body search; title and path matches are already
          available.
        </Text>
      ) : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    marginRight: 8,
  },
  clearBtn: {
    padding: 4,
  },
  status: {
    fontSize: 12,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    marginBottom: 6,
  },
  list: {
    paddingBottom: 24,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  hint: {
    marginTop: 24,
    textAlign: 'center',
  },
  hintCol: {
    alignItems: 'center',
    marginTop: 24,
  },
  retryLink: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  spinner: {
    marginTop: 24,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  rel: {
    fontSize: 12,
    marginTop: 4,
  },
  snippet: {
    fontSize: 13,
    marginTop: 6,
  },
  highlight: {
    backgroundColor: 'rgba(255, 220, 0, 0.35)',
  },
  footerHint: {
    fontSize: 12,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerIcon: {
    marginLeft: 12,
  },
});
