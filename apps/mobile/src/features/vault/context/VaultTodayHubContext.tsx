import {sortedTodayHubNoteUrisFromRefs} from '@eskerra/core';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {useVaultContext} from '../../../core/vault/VaultContext';

const CURRENT_WEEK_INDEX = 1;
const WEEK_COUNT = 53;

export type VaultTodayHubContextValue = {
  weekIndex: number;
  setWeekIndex: (i: number) => void;
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
  const [weekIndex, setWeekIndex] = useState(CURRENT_WEEK_INDEX);
  const [weekNavSubtitle, setWeekNavSubtitle] = useState('');

  const goPrevWeek = useCallback(() => {
    setWeekIndex(i => Math.max(0, i - 1));
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekIndex(i => Math.min(WEEK_COUNT - 1, i + 1));
  }, []);

  const resetWeekToCurrent = useCallback(() => {
    setWeekIndex(CURRENT_WEEK_INDEX);
  }, []);

  const canGoPrev = weekIndex > 0;
  const canGoNext = weekIndex < WEEK_COUNT - 1;

  const value = useMemo(
    (): VaultTodayHubContextValue => ({
      weekIndex,
      setWeekIndex,
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
      weekIndex,
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
