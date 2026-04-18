import {
  collectTodayHubRowStemsFromVaultMarkdownRefs,
  formatTodayHubMondayStem,
  parseTodayHubRowStemToLocalCalendarDate,
  sortedTodayHubNoteUrisFromRefs,
} from '@eskerra/core';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import {useVaultContext} from '../../../core/vault/VaultContext';

function normalizeLocalCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Largest `YYYY-MM-DD` stem in `sorted` that is strictly before `currentStem` (lex order = chronological). */
function findEarlierStem(sorted: readonly string[], currentStem: string): string | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < currentStem) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo > 0 ? sorted[lo - 1]! : null;
}

/** Smallest stem in `sorted` that is strictly after `currentStem`. */
function findLaterStem(sorted: readonly string[], currentStem: string): string | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= currentStem) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo < sorted.length ? sorted[lo]! : null;
}

export type VaultTodayHubContextValue = {
  /** Active Today.md URI for week navigation; set from VaultScreen. */
  activeTodayHubUri: string | null;
  setActiveTodayHubUri: (uri: string | null) => void;
  /** Calendar week start (local) for the visible hub row; null before first hub sync. */
  selectedWeekStart: Date | null;
  syncWeekNavToCurrentWeek: (weekStart: Date) => void;
  goPrevWeek: () => void;
  goNextWeek: () => void;
  resetWeekToCurrent: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  hasTodayHub: boolean;
  /** Shown between week nav buttons (e.g. date range); set from Vault hub screen. */
  weekNavSubtitle: string;
  setWeekNavSubtitle: (v: string) => void;
};

const VaultTodayHubContext = createContext<VaultTodayHubContextValue | null>(null);

export function VaultTodayHubProvider({children}: {children: React.ReactNode}) {
  const {vaultMarkdownRefs} = useVaultContext();
  const hasTodayHub = useMemo(
    () => sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs).length > 0,
    [vaultMarkdownRefs],
  );

  const [activeTodayHubUri, setActiveTodayHubUriState] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null);
  const [weekNavSubtitle, setWeekNavSubtitle] = useState('');

  const calendarAnchorWeekStartRef = useRef<Date | null>(null);

  const rowStems = useMemo(() => {
    if (!activeTodayHubUri) {
      return new Set<string>();
    }
    return collectTodayHubRowStemsFromVaultMarkdownRefs(activeTodayHubUri, vaultMarkdownRefs);
  }, [activeTodayHubUri, vaultMarkdownRefs]);

  const sortedRowStems = useMemo(() => {
    const arr = Array.from(rowStems);
    arr.sort();
    return arr;
  }, [rowStems]);

  const sortedRowStemsRef = useRef<readonly string[]>([]);
  sortedRowStemsRef.current = sortedRowStems;

  const setActiveTodayHubUri = useCallback((uri: string | null) => {
    setActiveTodayHubUriState(uri);
    setSelectedWeekStart(null);
    calendarAnchorWeekStartRef.current = null;
  }, []);

  const syncWeekNavToCurrentWeek = useCallback((weekStart: Date) => {
    const n = normalizeLocalCalendarDate(weekStart);
    calendarAnchorWeekStartRef.current = n;
    setSelectedWeekStart(n);
  }, []);

  const resetWeekToCurrent = useCallback(() => {
    const anchor = calendarAnchorWeekStartRef.current;
    if (anchor) {
      setSelectedWeekStart(normalizeLocalCalendarDate(anchor));
    }
  }, []);

  const canGoPrev = useMemo(() => {
    if (!selectedWeekStart || !activeTodayHubUri) {
      return false;
    }
    const currentStem = formatTodayHubMondayStem(selectedWeekStart);
    return findEarlierStem(sortedRowStems, currentStem) != null;
  }, [activeTodayHubUri, selectedWeekStart, sortedRowStems]);

  const canGoNext = useMemo(() => {
    if (!selectedWeekStart || !activeTodayHubUri) {
      return false;
    }
    const currentStem = formatTodayHubMondayStem(selectedWeekStart);
    return findLaterStem(sortedRowStems, currentStem) != null;
  }, [activeTodayHubUri, selectedWeekStart, sortedRowStems]);

  const goPrevWeek = useCallback(() => {
    setSelectedWeekStart(prev => {
      if (!prev) {
        return prev;
      }
      const stem = findEarlierStem(
        sortedRowStemsRef.current,
        formatTodayHubMondayStem(prev),
      );
      if (!stem) {
        return prev;
      }
      const d = parseTodayHubRowStemToLocalCalendarDate(stem);
      return d ? normalizeLocalCalendarDate(d) : prev;
    });
  }, []);

  const goNextWeek = useCallback(() => {
    setSelectedWeekStart(prev => {
      if (!prev) {
        return prev;
      }
      const stem = findLaterStem(
        sortedRowStemsRef.current,
        formatTodayHubMondayStem(prev),
      );
      if (!stem) {
        return prev;
      }
      const d = parseTodayHubRowStemToLocalCalendarDate(stem);
      return d ? normalizeLocalCalendarDate(d) : prev;
    });
  }, []);

  const value = useMemo(
    (): VaultTodayHubContextValue => ({
      activeTodayHubUri,
      setActiveTodayHubUri,
      selectedWeekStart,
      syncWeekNavToCurrentWeek,
      goPrevWeek,
      goNextWeek,
      resetWeekToCurrent,
      canGoPrev,
      canGoNext,
      hasTodayHub,
      weekNavSubtitle,
      setWeekNavSubtitle,
    }),
    [
      activeTodayHubUri,
      setActiveTodayHubUri,
      selectedWeekStart,
      syncWeekNavToCurrentWeek,
      goPrevWeek,
      goNextWeek,
      resetWeekToCurrent,
      canGoPrev,
      canGoNext,
      hasTodayHub,
      weekNavSubtitle,
    ],
  );

  return (
    <VaultTodayHubContext.Provider value={value}>{children}</VaultTodayHubContext.Provider>
  );
}

export function useVaultTodayHubContext(): VaultTodayHubContextValue {
  const ctx = useContext(VaultTodayHubContext);
  if (!ctx) {
    throw new Error('useVaultTodayHubContext must be used within VaultTodayHubProvider');
  }
  return ctx;
}
