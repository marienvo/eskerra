import {useMemo} from 'react';

import type {WindowTitleBarTodayHubSelect} from '../components/WindowTitleBar';

export function useAppTitleBarTodayHubSelect(
  vaultRoot: string | null,
  todayHubSelectorItems: ReadonlyArray<{
    todayNoteUri: string;
    label: string;
  }>,
  activeTodayHubUri: string | null,
  workspaceSelectShowsActiveTabPill: boolean,
  focusActiveTodayHubNote: () => void,
  switchTodayHubWorkspace: (uri: string) => void | Promise<void>,
  openTodayHubInNewTabAfterActive: (uri: string) => void,
): WindowTitleBarTodayHubSelect {
  return useMemo((): WindowTitleBarTodayHubSelect => {
    if (
      !vaultRoot
      || todayHubSelectorItems.length === 0
      || activeTodayHubUri == null
    ) {
      return null;
    }
    const activeLabel =
      todayHubSelectorItems.find(i => i.todayNoteUri === activeTodayHubUri)
        ?.label ?? 'Today';
    return {
      items: todayHubSelectorItems,
      activeTodayNoteUri: activeTodayHubUri,
      activeLabel,
      mainShowsActiveTabPill: workspaceSelectShowsActiveTabPill,
      onMainActivate: focusActiveTodayHubNote,
      onPickHub: (uri: string) => {
        void switchTodayHubWorkspace(uri);
      },
      onOpenHubInNewTab: openTodayHubInNewTabAfterActive,
    };
  }, [
    vaultRoot,
    todayHubSelectorItems,
    activeTodayHubUri,
    workspaceSelectShowsActiveTabPill,
    focusActiveTodayHubNote,
    switchTodayHubWorkspace,
    openTodayHubInNewTabAfterActive,
  ]);
}
