import {
  addLocalCalendarDays,
  collectTodayHubRowStemsFromVaultMarkdownRefs,
  formatTodayHubMondayStem,
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
  const rowStemsRef = useRef<ReadonlySet<string>>(new Set());

  const rowStems = useMemo(() => {
    if (!activeTodayHubUri) {
      return new Set<string>();
    }
    return collectTodayHubRowStemsFromVaultMarkdownRefs(activeTodayHubUri, vaultMarkdownRefs);
  }, [activeTodayHubUri, vaultMarkdownRefs]);

  rowStemsRef.current = rowStems;

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
    const prevStart = addLocalCalendarDays(selectedWeekStart, -7);
    return rowStems.has(formatTodayHubMondayStem(prevStart));
  }, [activeTodayHubUri, rowStems, selectedWeekStart]);

  const canGoNext = useMemo(() => {
    if (!selectedWeekStart || !activeTodayHubUri) {
      return false;
    }
    const nextStart = addLocalCalendarDays(selectedWeekStart, 7);
    return rowStems.has(formatTodayHubMondayStem(nextStart));
  }, [activeTodayHubUri, rowStems, selectedWeekStart]);

  const goPrevWeek = useCallback(() => {
    setSelectedWeekStart(prev => {
      if (!prev) {
        return prev;
      }
      const prevStart = addLocalCalendarDays(prev, -7);
      const stem = formatTodayHubMondayStem(prevStart);
      if (!rowStemsRef.current.has(stem)) {
        return prev;
      }
      return normalizeLocalCalendarDate(prevStart);
    });
  }, []);

  const goNextWeek = useCallback(() => {
    setSelectedWeekStart(prev => {
      if (!prev) {
        return prev;
      }
      const nextStart = addLocalCalendarDays(prev, 7);
      const stem = formatTodayHubMondayStem(nextStart);
      if (!rowStemsRef.current.has(stem)) {
        return prev;
      }
      return normalizeLocalCalendarDate(nextStart);
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
