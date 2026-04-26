import {
  formatTodayHubMondayStem,
  sortedTodayHubNoteUrisFromRefs,
  splitTodayRowIntoColumns,
  todayHubColumnCount,
  todayHubFolderLabelFromTodayNoteUri,
} from '@eskerra/core';
import {StackScreenProps} from '@react-navigation/stack';
import {Box, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet} from 'react-native';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {VaultStackParamList} from '../../../navigation/types';
import {useVaultTodayHubContext} from '../context/VaultTodayHubContext';
import {useVaultMarkdownRefs} from '../hooks/useVaultMarkdownRefs';
import {useNotes} from '../hooks/useNotes';
import {
  loadPersistedActiveTodayHubUri,
  persistActiveTodayHubUri,
} from '../storage/activeTodayHubStorage';
import {formatTodayHubWeekDateLong, formatTodayHubWeekRangeShort} from '../todayHubFormat';
import {
  loadVaultHubIntroNote,
  loadVaultHubRowForWeek,
  type HubIntroState,
} from './vaultScreenTodayHubLoaders';
import {useVaultTodayTabHeader} from './useVaultTodayTabHeader';
import {VaultTodayHubWorkArea} from './VaultTodayHubWorkArea';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

function normalizeHubUri(u: string): string {
  return u.replace(/\\/g, '/');
}

function findHubInList(hubs: string[], u: string | null): string | null {
  if (!u) {
    return null;
  }
  const n = normalizeHubUri(u);
  return hubs.find(h => normalizeHubUri(h) === n) ?? null;
}

function resolveActiveHubUri(
  hubs: string[],
  persistedHubUri: string | null | undefined,
  userPickedHubUri: string | null,
): string | null {
  if (hubs.length === 0) {
    return null;
  }
  if (userPickedHubUri) {
    const picked = findHubInList(hubs, userPickedHubUri);
    if (picked) {
      return picked;
    }
  }
  if (persistedHubUri === undefined) {
    return null;
  }
  const fromStore = findHubInList(hubs, persistedHubUri);
  return fromStore ?? hubs[0] ?? null;
}

function computeColumnHeaders(
  hubIntro: HubIntroState,
  renderedWeekStart: Date | null,
): string[] {
  if (hubIntro.status !== 'ready' || renderedWeekStart == null) {
    return [];
  }
  const {settings} = hubIntro;
  const count = todayHubColumnCount(settings);
  const h: string[] = [];
  for (let c = 0; c < count; c++) {
    if (c === 0) {
      h.push(formatTodayHubWeekDateLong(renderedWeekStart));
    } else {
      h.push(settings.columns[c - 1] ?? `Column ${c + 1}`);
    }
  }
  return h;
}

/** Show week-nav loading spinner only if row fetch exceeds this (avoids flash on prefetch). */
const ROW_NAV_LOADING_DELAY_MS = 200;

const styles = StyleSheet.create({
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
  spinner: {
    marginVertical: 16,
  },
});

export function VaultScreen({navigation}: VaultScreenProps) {
  const colorMode = useColorMode();
  const muted = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const {baseUri} = useVaultContext();
  const {read} = useNotes();
  const {
    resetWeekToCurrent,
    selectedWeekStart,
    setActiveTodayHubUri,
    setWeekNavSubtitle,
    syncWeekNavToCurrentWeek,
  } = useVaultTodayHubContext();
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

  // Wait for AsyncStorage before falling back to hubs[0]: avoids a cold-start SAF read for the
  // wrong hub before prepareEskerraSession prefetches the right one (persistedHubUri=undefined means still loading).
  const activeHubUri = useMemo(
    () => resolveActiveHubUri(hubs, persistedHubUri, userPickedHubUri),
    [hubs, persistedHubUri, userPickedHubUri],
  );

  /**
   * Persist the effective active hub (persisted or first-hub fallback) so the next
   * cold-start's native `prepareEskerraSession` prefetch includes the Today.md + week
   * row bodies, avoiding a live SAF read on the first Today-tab tap.
   */
  useEffect(() => {
    if (activeHubUri == null || persistedHubUri === undefined) {
      return;
    }
    if (persistedHubUri != null && normalizeHubUri(persistedHubUri) === normalizeHubUri(activeHubUri)) {
      return;
    }
    persistActiveTodayHubUri(activeHubUri).catch(() => undefined);
    setPersistedHubUri(activeHubUri);
  }, [activeHubUri, persistedHubUri]);

  useEffect(() => {
    setActiveTodayHubUri(activeHubUri);
  }, [activeHubUri, setActiveTodayHubUri]);

  const [hubIntro, setHubIntro] = useState<HubIntroState>({status: 'idle'});
  const [rowByWeek, setRowByWeek] = useState<Map<string, string>>(() => new Map());
  const [renderedWeekStart, setRenderedWeekStart] = useState<Date | null>(null);
  const [isNavLoading, setIsNavLoading] = useState(false);
  const weekNavInitHubRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeHubUri) {
      setHubIntro({status: 'idle'});
      setRowByWeek(new Map());
      return;
    }
    let cancelled = false;
    setHubIntro({status: 'loading'});
    setRowByWeek(new Map());
    loadVaultHubIntroNote({
      activeHubUri,
      isCancelled: () => cancelled,
      read,
      setHubIntro,
      setRowByWeek,
      syncWeekNavToCurrentWeek,
      weekNavInitHubRef,
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeHubUri, read, syncWeekNavToCurrentWeek]);

  useEffect(() => {
    if (!activeHubUri || hubIntro.status !== 'ready' || selectedWeekStart == null) {
      return;
    }
    const stem = formatTodayHubMondayStem(selectedWeekStart);
    if (rowByWeek.has(stem)) {
      return;
    }
    let cancelled = false;
    loadVaultHubRowForWeek({
      activeHubUri,
      isCancelled: () => cancelled,
      read,
      selectedWeekStart,
      setRowByWeek,
      stem,
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeHubUri, hubIntro.status, read, rowByWeek, selectedWeekStart]);

  useEffect(() => {
    if (!activeHubUri || hubIntro.status !== 'ready') {
      setRenderedWeekStart(null);
      setIsNavLoading(false);
    }
  }, [activeHubUri, hubIntro.status]);

  useEffect(() => {
    if (hubIntro.status !== 'ready' || selectedWeekStart == null) {
      return;
    }
    const stem = formatTodayHubMondayStem(selectedWeekStart);
    if (!rowByWeek.has(stem)) {
      return;
    }
    setRenderedWeekStart(prev => {
      if (prev != null && formatTodayHubMondayStem(prev) === stem) {
        return prev;
      }
      return selectedWeekStart;
    });
    setIsNavLoading(false);
  }, [hubIntro.status, rowByWeek, selectedWeekStart]);

  useEffect(() => {
    if (hubIntro.status !== 'ready' || selectedWeekStart == null) {
      setIsNavLoading(false);
      return;
    }
    const stem = formatTodayHubMondayStem(selectedWeekStart);
    if (rowByWeek.has(stem)) {
      setIsNavLoading(false);
      return;
    }
    const id = setTimeout(() => {
      setIsNavLoading(true);
    }, ROW_NAV_LOADING_DELAY_MS);
    return () => {
      clearTimeout(id);
    };
  }, [hubIntro.status, rowByWeek, selectedWeekStart]);

  useEffect(() => {
    if (selectedWeekStart == null) {
      setWeekNavSubtitle('');
    } else {
      setWeekNavSubtitle(formatTodayHubWeekRangeShort(selectedWeekStart));
    }
  }, [selectedWeekStart, setWeekNavSubtitle]);

  const selectHub = useCallback(
    (uri: string) => {
      setUserPickedHubUri(uri);
      resetWeekToCurrent();
      persistActiveTodayHubUri(uri).catch(() => undefined);
    },
    [resetWeekToCurrent],
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

  useVaultTodayTabHeader({
    headerTitle,
    hubsLength: hubs.length,
    navigation,
    openHubPicker,
    styles,
  });

  const onNavigateToVaultNote = useCallback(
    (noteUri: string, noteTitle: string) => {
      navigation.navigate('VaultNoteRead', {noteUri, noteTitle});
    },
    [navigation],
  );

  const columnSections = useMemo(() => {
    if (hubIntro.status !== 'ready' || renderedWeekStart == null) {
      return [];
    }
    const count = todayHubColumnCount(hubIntro.settings);
    const stem = formatTodayHubMondayStem(renderedWeekStart);
    const row = rowByWeek.get(stem) ?? '';
    return splitTodayRowIntoColumns(row, count);
  }, [hubIntro, rowByWeek, renderedWeekStart]);

  const columnHeaders = useMemo(
    () => computeColumnHeaders(hubIntro, renderedWeekStart),
    [hubIntro, renderedWeekStart],
  );

  /** Stable "now" for week progress so columns agree within one paint. */
  const weekProgressComparisonNow = useMemo(() => new Date(), []);

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

  const showHubIntroSpinner =
    activeHubUri != null &&
    (hubIntro.status === 'loading' || hubIntro.status === 'idle');

  return (
    <VaultTodayHubWorkArea
      activeHubUri={activeHubUri}
      columnHeaders={columnHeaders}
      columnSections={columnSections}
      hubIntro={hubIntro}
      hubPickerOpen={hubPickerOpen}
      hubs={hubs}
      isNavLoading={isNavLoading}
      isVaultMarkdownRefsLoading={isVaultMarkdownRefsLoading}
      muted={muted}
      onNavigateToVaultNote={onNavigateToVaultNote}
      renderedWeekStart={renderedWeekStart}
      selectHub={selectHub}
      setHubPickerOpen={setHubPickerOpen}
      showHubIntroSpinner={showHubIntroSpinner}
      vaultMarkdownRefsError={vaultMarkdownRefsError}
      weekProgressComparisonNow={weekProgressComparisonNow}
      wikiIndexLoading={wikiIndexLoading}
    />
  );
}
