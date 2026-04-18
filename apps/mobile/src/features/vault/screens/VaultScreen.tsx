import {
  enumerateTodayHubWeekStarts,
  parseTodayHubFrontmatter,
  sortedTodayHubNoteUrisFromRefs,
  splitTodayRowIntoColumns,
  todayHubColumnCount,
  todayHubDirectoryUriFromTodayNoteUri,
  todayHubFolderLabelFromUri,
  todayHubFolderLabelFromVaultMarkdownRef,
  todayHubRowUri,
  type TodayHubSettings,
} from '@eskerra/core';
import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {VaultStackParamList} from '../../../navigation/types';
import {useVaultTodayHubContext} from '../context/VaultTodayHubContext';
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
    if (persistedHubUri !== undefined) {
      const fromStore = findInHubs(persistedHubUri);
      if (fromStore) {
        return fromStore;
      }
    }
    return hubs[0] ?? null;
  }, [hubs, persistedHubUri, userPickedHubUri]);

  useEffect(() => {
    vaultToday.setHasTodayHub(hubs.length > 0);
  }, [hubs.length, vaultToday]);

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
        const rowUri = todayHubRowUri(todayHubDirectoryUriFromTodayNoteUri(activeHubUri), ws);
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

  const openHubPicker = useCallback(() => {
    if (hubs.length <= 1) {
      return;
    }
    const buttons = [
      ...hubs.map(uri => {
        const norm = uri.replace(/\\/g, '/');
        const ref = vaultMarkdownRefs.find(r => r.uri.replace(/\\/g, '/') === norm);
        const label = ref
          ? todayHubFolderLabelFromVaultMarkdownRef(ref)
          : todayHubFolderLabelFromUri(uri);
        return {
          text: label,
          onPress: () => selectHub(uri),
        };
      }),
      {text: 'Cancel', style: 'cancel' as const},
    ];
    Alert.alert('Today hub', 'Choose a hub', buttons);
  }, [hubs, selectHub, vaultMarkdownRefs]);

  const wikiIndexLoading =
    vaultMarkdownRefsStatus !== 'ready' &&
    vaultMarkdownRefsStatus !== 'error' &&
    vaultMarkdownRefs.length === 0;

  const awaitingVaultMarkdownIndex =
    baseUri != null &&
    vaultMarkdownRefsStatus !== 'ready' &&
    vaultMarkdownRefsStatus !== 'error';

  const headerTitle = useMemo(() => {
    if (!activeHubUri) {
      return 'Today';
    }
    const norm = activeHubUri.replace(/\\/g, '/');
    const ref = vaultMarkdownRefs.find(r => r.uri.replace(/\\/g, '/') === norm);
    if (ref) {
      return todayHubFolderLabelFromVaultMarkdownRef(ref);
    }
    return todayHubFolderLabelFromUri(activeHubUri);
  }, [activeHubUri, vaultMarkdownRefs]);

  const isVaultHubTopRoute = useCallback((): boolean => {
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

  useLayoutEffect(() => {
    if (!isVaultHubTopRoute()) {
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
      headerLeft: undefined,
      headerRight: renderSearchHeaderRight,
      headerTitle: () => titleEl,
    });
    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Today',
      });
    };
  }, [
    headerTitle,
    hubs.length,
    isVaultHubTopRoute,
    navigation,
    openHubPicker,
    renderSearchHeaderRight,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isVaultHubTopRoute()) {
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
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      headerTitle,
      hubs.length,
      isVaultHubTopRoute,
      navigation,
      openHubPicker,
      renderSearchHeaderRight,
    ]),
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
                noteUri={todayHubRowUri(
                  todayHubDirectoryUriFromTodayNoteUri(activeHubUri!),
                  hubLoadState.weekStart,
                )}
                omitWikiIndexWarning
                sectionTitle={columnHeaders[ci] ?? ''}
                onNavigateToVaultNote={onNavigateToVaultNote}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
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
