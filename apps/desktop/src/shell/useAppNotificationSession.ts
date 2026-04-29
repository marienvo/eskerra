import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {useSessionNotifications} from '../hooks/useSessionNotifications';
import {normalizeEditorDocUri} from '../lib/editorDocumentHistory';
import type {AppStatusBarCenter} from '../lib/resolveAppStatusBarCenter';

type UseAppNotificationSessionArgs = {
  err: string | null;
  diskConflict: unknown;
  diskConflictSoft: {uri: string} | null;
  selectedUri: string | null;
  statusBarCenter: AppStatusBarCenter;
  renameLinkProgress: {done: number; total: number} | null;
  setNotificationsPanelVisible: Dispatch<SetStateAction<boolean>>;
};

export function useAppNotificationSession({
  err,
  diskConflict,
  diskConflictSoft,
  selectedUri,
  statusBarCenter,
  renameLinkProgress,
  setNotificationsPanelVisible,
}: UseAppNotificationSessionArgs) {
  const diskConflictSoftVisible = useMemo(
    () =>
      !err &&
      diskConflict == null &&
      diskConflictSoft != null &&
      selectedUri != null &&
      normalizeEditorDocUri(diskConflictSoft.uri) ===
        normalizeEditorDocUri(selectedUri),
    [err, diskConflict, diskConflictSoft, selectedUri],
  );

  const openNotificationsPanel = useCallback(() => {
    setNotificationsPanelVisible(true);
  }, [setNotificationsPanelVisible]);

  const session = useSessionNotifications(
    {
      statusBarCenter,
      renameLinkProgress,
      diskConflictBlocking: diskConflict != null,
      diskConflictSoftVisible,
    },
    {onOpenPanel: openNotificationsPanel},
  );

  return session;
}
