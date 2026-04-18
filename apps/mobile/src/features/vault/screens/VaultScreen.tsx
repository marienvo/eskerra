import {
  enumerateTodayHubWeekStarts,
  parseTodayHubFrontmatter,
  sortedTodayHubNoteUrisFromRefs,
  splitTodayRowIntoColumns,
  todayHubColumnCount,
  todayHubFolderLabelFromTodayNoteUri,
  todayHubRowUriFromTodayNoteUri,
  type TodayHubSettings,
} from '@eskerra/core';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {VaultStackParamList} from '../../../navigation/types';
import {useVaultTodayHubContext} from '../context/VaultTodayHubContext';
import {TodayHubPickerModal} from '../components/TodayHubPickerModal';
import {VaultReadonlyMarkdownBlock} from '../components/VaultReadonlyMarkdownBlock';
import {useVaultMarkdownRefs} from '../hooks/useVaultMarkdownRefs';
import {useNotes} from '../hooks/useNotes';
import {
  loadPersistedActiveTodayHubUri,
  persistActiveTodayHubUri,
} from '../storage/activeTodayHubStorage';
import {formatTodayHubWeekDateLong, formatTodayHubWeekRangeShort} from '../todayHubFormat';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

type HubLoadState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {
      status: 'ready';
      intro: string;
      row: string;
      settings: TodayHubSettings;
      weekStart: Date;
    };

export function VaultScreen({navigation}: VaultScreenProps) {
  const isScreenFocused = useIsFocused();
  const colorMode = useColorMode();
  const muted = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const {baseUri} = useVaultContext();
  const {read} = useNotes();
  const vaultToday = useVaultTodayHubContext();
  const {
    vaultMarkdownRefs,
    isVaultMarkdownRefsLoading,
    vaultMarkdownRefsError,
    vaultMarkdownRefsStatus,
  } = useVaultMarkdownRefs();

  const hubs = useMemo(
    () => sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs),
    [vaultMarkdownRefs],
  );

  const [persistedHubUri, setPersistedHubUri] = useState<string | null | undefined>(undefined);
  const [userPickedHubUri, setUserPickedHubUri] = useState<string | null>(null);

  useEffect(() => {
    loadPersistedActiveTodayHubUri().then(uri => setPersistedHubUri(uri));
  }, []);

  const activeHubUri = useMemo(() => {
    if (hubs.length === 0) {
      return null;
    }
    const normalize = (u: string) => u.replace(/\\/g, '/');
    const findInHubs = (u: string | null) => {
      if (!u) {
        return null;
      }
      const n = normalize(u);
      return hubs.find(h => normalize(h) === n) ?? null;
    };
    if (userPickedHubUri) {
      const picked = findInHubs(userPickedHubUri);
      if (picked) {
        return picked;
      }
    }
    /**
     * Wait for the persisted active hub URI to resolve from AsyncStorage before falling back
     * to the first hub alphabetically. Otherwise the initial cold-start render picks `hubs[0]`
     * (possibly the wrong hub) and fires a live SAF read for a hub whose content was never
     * prefetched by `prepareEskerraSession`, wasting I/O in parallel with the real hub read.
     */
    if (persistedHubUri === undefined) {
      return null;
    }
    const fromStore = findInHubs(persistedHubUri);
    if (fromStore) {
      return fromStore;
    }
    return hubs[0] ?? null;
  }, [hubs, persistedHubUri, userPickedHubUri]);

  /**
   * Persist the effective active hub (persisted or first-hub fallback) so the next
   * cold-start's native `prepareEskerraSession` prefetch includes the Today.md + week
   * row bodies, avoiding a live SAF read on the first Today-tab tap.
   */
  useEffect(() => {
    if (activeHubUri == null || persistedHubUri === undefined) {
      return;
    }
    const normalize = (u: string) => u.replace(/\\/g, '/');
    if (persistedHubUri != null && normalize(persistedHubUri) === normalize(activeHubUri)) {
      return;
    }
    persistActiveTodayHubUri(activeHubUri).catch(() => undefined);
    setPersistedHubUri(activeHubUri);
  }, [activeHubUri, persistedHubUri]);

  const weekIndex = vaultToday.weekIndex;

  const [hubLoadState, setHubLoadState] = useState<HubLoadState>({status: 'idle'});

  useEffect(() => {
    if (!activeHubUri) {
      setHubLoadState({status: 'idle'});
      return;
    }
    let cancelled = false;
    setHubLoadState({status: 'loading'});
    (async () => {
      try {
        const introNote = await read(activeHubUri);
        if (cancelled) {
          return;
        }
        const settings = parseTodayHubFrontmatter(introNote.content);
        const weekStarts = enumerateTodayHubWeekStarts(new Date(), settings.start);
        const ws = weekStarts[weekIndex]!;
        const rowUri = todayHubRowUriFromTodayNoteUri(activeHubUri, ws);
        let rowContent = '';
        try {
          const rowNote = await read(rowUri);
          rowContent = rowNote.content;
        } catch {
          rowContent = '';
        }
        if (cancelled) {
          return;
        }
        setHubLoadState({
          status: 'ready',
          intro: introNote.content,
          row: rowContent,
          settings,
          weekStart: ws,
        });
      } catch (e) {
        if (!cancelled) {
          setHubLoadState({
            status: 'error',
            message: e instanceof Error ? e.message : 'Could not load Today hub.',
          });
        }
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeHubUri, read, weekIndex]);

  const {setWeekNavSubtitle} = vaultToday;
  useEffect(() => {
    if (hubLoadState.status === 'ready') {
      setWeekNavSubtitle(formatTodayHubWeekRangeShort(hubLoadState.weekStart));
    } else {
      setWeekNavSubtitle('');
    }
  }, [hubLoadState, setWeekNavSubtitle]);

  const selectHub = useCallback(
    (uri: string) => {
      setUserPickedHubUri(uri);
      vaultToday.resetWeekToCurrent();
      persistActiveTodayHubUri(uri).catch(() => undefined);
    },
    [vaultToday],
  );

  const [hubPickerOpen, setHubPickerOpen] = useState(false);

  const openHubPicker = useCallback(() => {
    if (hubs.length <= 1) {
      return;
    }
    setHubPickerOpen(true);
  }, [hubs.length]);

  const wikiIndexLoading =
    vaultMarkdownRefsStatus !== 'ready' &&
    vaultMarkdownRefsStatus !== 'error' &&
    vaultMarkdownRefs.length === 0;

  /** Block only when we still have no Today hubs and the wiki index has not settled. */
  const awaitingVaultMarkdownIndex =
    baseUri != null &&
    hubs.length === 0 &&
    vaultMarkdownRefsStatus !== 'ready' &&
    vaultMarkdownRefsStatus !== 'error';

  const headerTitle = useMemo(() => {
    if (!activeHubUri) {
      return 'Today';
    }
    return todayHubFolderLabelFromTodayNoteUri(activeHubUri);
  }, [activeHubUri]);

  const isVaultHubTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Vault';
  }, [navigation]);

  const shouldShowTodayTabHeader = isVaultHubTopRoute() && isScreenFocused;

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

  const applyTodayTabHeader = useCallback(() => {
    if (!shouldShowTodayTabHeader) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }
    const titleEl =
      hubs.length > 1 ? (
        <TouchableOpacity
          accessibilityLabel="Choose Today hub"
          hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
          onPress={openHubPicker}
          style={styles.headerTitleButton}>
          <Text style={styles.headerTitleText}>{headerTitle}</Text>
          <MaterialIcons color="#ffffff" name="arrow-drop-down" size={22} />
        </TouchableOpacity>
      ) : (
        <Text style={styles.headerTitlePlain}>{headerTitle}</Text>
      );
    tabNavigation.setOptions({
      headerShown: true,
      headerLeft: undefined,
      headerRight: renderSearchHeaderRight,
      headerTitle: () => titleEl,
    });
  }, [
    shouldShowTodayTabHeader,
    headerTitle,
    hubs.length,
    navigation,
    openHubPicker,
    renderSearchHeaderRight,
  ]);

  useLayoutEffect(() => {
    applyTodayTabHeader();
  }, [applyTodayTabHeader]);

  useFocusEffect(
    useCallback(() => {
      applyTodayTabHeader();
      const frameId = requestAnimationFrame(() => {
        applyTodayTabHeader();
      });
      const timeoutId = setTimeout(() => {
        applyTodayTabHeader();
      }, 0);
      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(timeoutId);
      };
    }, [applyTodayTabHeader]),
  );

  const onNavigateToVaultNote = useCallback(
    (noteUri: string, noteTitle: string) => {
      navigation.navigate('VaultNoteRead', {noteUri, noteTitle});
    },
    [navigation],
  );

  const columnSections = useMemo(() => {
    if (hubLoadState.status !== 'ready') {
      return [];
    }
    const count = todayHubColumnCount(hubLoadState.settings);
    return splitTodayRowIntoColumns(hubLoadState.row, count);
  }, [hubLoadState]);

  const columnHeaders = useMemo(() => {
    if (hubLoadState.status !== 'ready') {
      return [];
    }
    const {settings, weekStart} = hubLoadState;
    const count = todayHubColumnCount(settings);
    const h: string[] = [];
    for (let c = 0; c < count; c++) {
      if (c === 0) {
        h.push(formatTodayHubWeekDateLong(weekStart));
      } else {
        h.push(settings.columns[c - 1] ?? `Column ${c + 1}`);
      }
    }
    return h;
  }, [hubLoadState]);

  if (awaitingVaultMarkdownIndex) {
    return (
      <Box style={styles.container}>
        <Spinner accessibilityLabel="Loading vault" style={styles.spinner} />
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          Loading vault…
        </Text>
      </Box>
    );
  }

  if (hubs.length === 0) {
    return (
      <Box style={styles.container}>
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          Open search to browse notes in this vault.
        </Text>
      </Box>
    );
  }

  return (
    <Box style={styles.container}>
      {hubLoadState.status === 'loading' || hubLoadState.status === 'idle' ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {hubLoadState.status === 'error' ? (
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          {hubLoadState.message}
        </Text>
      ) : null}
      {hubLoadState.status === 'ready' ? (
        <ScrollView contentContainerStyle={styles.scrollContent} nestedScrollEnabled>
          {vaultMarkdownRefsError ? (
            <Text style={[styles.indexWarning, {color: muted}]}>
              Link name index unavailable ({vaultMarkdownRefsError}). Wiki links may not resolve until
              the vault is reachable again.
            </Text>
          ) : null}
          {isVaultMarkdownRefsLoading && wikiIndexLoading ? (
            <Text style={[styles.indexHint, {color: muted}]}>Indexing vault notes for links…</Text>
          ) : null}
          <VaultReadonlyMarkdownBlock
            markdownFullText={hubLoadState.intro}
            noteUri={activeHubUri!}
            omitWikiIndexWarning
            onNavigateToVaultNote={onNavigateToVaultNote}
          />
          <View style={styles.columnsWrap}>
            {columnSections.map((colBody, ci) => (
              <VaultReadonlyMarkdownBlock
                key={`col-${ci}`}
                markdownFullText={colBody}
                noteUri={todayHubRowUriFromTodayNoteUri(activeHubUri!, hubLoadState.weekStart)}
                omitWikiIndexWarning
                sectionTitle={columnHeaders[ci] ?? ''}
                onNavigateToVaultNote={onNavigateToVaultNote}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      <TodayHubPickerModal
        activeUri={activeHubUri}
        colorMode={colorMode === 'dark' ? 'dark' : 'light'}
        hubs={hubs}
        visible={hubPickerOpen}
        onClose={() => setHubPickerOpen(false)}
        onPick={selectHub}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  columnsWrap: {
    marginTop: 8,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
  },
  headerIconButton: {
    marginRight: 12,
  },
  headerTitleButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: 260,
  },
  headerTitlePlain: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerTitleText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  indexHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  indexWarning: {
    fontSize: 12,
    marginBottom: 8,
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  spinner: {
    marginVertical: 16,
  },
});
