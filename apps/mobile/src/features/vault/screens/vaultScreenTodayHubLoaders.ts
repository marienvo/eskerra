import type {MutableRefObject} from 'react';

import {
  enumerateTodayHubWeekStarts,
  parseTodayHubFrontmatter,
  todayHubRowUriFromTodayNoteUri,
  type TodayHubSettings,
} from '@eskerra/core';

export type HubIntroState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; intro: string; settings: TodayHubSettings};

type ReadNote = (noteUri: string) => Promise<{content: string}>;

/** Loads Today hub intro + initial week nav sync (used from VaultScreen effect). */
export async function loadVaultHubIntroNote(params: {
  activeHubUri: string;
  isCancelled: () => boolean;
  read: ReadNote;
  setHubIntro: (next: HubIntroState) => void;
  setRowByWeek: (next: Map<string, string>) => void;
  syncWeekNavToCurrentWeek: (weekStart: Date) => void;
  weekNavInitHubRef: MutableRefObject<string | null>;
}): Promise<void> {
  const {
    activeHubUri,
    isCancelled,
    read,
    setHubIntro,
    setRowByWeek,
    syncWeekNavToCurrentWeek,
    weekNavInitHubRef,
  } = params;

  try {
    const introNote = await read(activeHubUri);
    if (isCancelled()) {
      return;
    }
    const settings = parseTodayHubFrontmatter(introNote.content);
    const weekStarts = enumerateTodayHubWeekStarts(new Date(), settings.start);
    const anchorWs = weekStarts[1]!;
    if (weekNavInitHubRef.current !== activeHubUri) {
      weekNavInitHubRef.current = activeHubUri;
      syncWeekNavToCurrentWeek(anchorWs);
    }
    if (isCancelled()) {
      return;
    }
    setHubIntro({
      status: 'ready',
      intro: introNote.content,
      settings,
    });
  } catch (e) {
    if (isCancelled()) {
      return;
    }
    setHubIntro({
      status: 'error',
      message: e instanceof Error ? e.message : 'Could not load Today hub.',
    });
    setRowByWeek(new Map());
  }
}

/** Loads one week row body into the map (used from VaultScreen effect). */
export async function loadVaultHubRowForWeek(params: {
  activeHubUri: string;
  isCancelled: () => boolean;
  read: ReadNote;
  selectedWeekStart: Date;
  setRowByWeek: (updater: (prev: Map<string, string>) => Map<string, string>) => void;
  stem: string;
}): Promise<void> {
  const {activeHubUri, isCancelled, read, selectedWeekStart, setRowByWeek, stem} = params;
  const rowUri = todayHubRowUriFromTodayNoteUri(activeHubUri, selectedWeekStart);
  let rowContent = '';
  try {
    const rowNote = await read(rowUri);
    rowContent = rowNote.content;
  } catch {
    rowContent = '';
  }
  if (isCancelled()) {
    return;
  }
  setRowByWeek(prev => {
    const next = new Map(prev);
    next.set(stem, rowContent);
    return next;
  });
}
