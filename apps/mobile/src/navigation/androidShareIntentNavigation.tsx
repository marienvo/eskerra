import {useEffect, useRef} from 'react';
import {AppState, NativeModules, Platform} from 'react-native';

import {setPendingShareDraft} from '../core/share/pendingShareDraft';
import {sharePayloadToComposeInput} from '../core/share/sharePayloadToComposeInput';

import {navigationRef} from './navigationContainerRef';

type PendingShareNative = {
  mimeType: string;
  subject: string;
  text: string;
};

const AndroidShareIntent = NativeModules.AndroidShareIntent as
  | {getPendingShare: () => Promise<PendingShareNative | null>}
  | undefined;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function isRootMainTabs(): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }
  const state = navigationRef.getRootState();
  if (!state?.routes?.length) {
    return false;
  }
  const idx = state.index ?? 0;
  return state.routes[idx]?.name === 'MainTabs';
}

export async function tryConsumeAndroidShareNavigation(): Promise<void> {
  if (Platform.OS !== 'android' || !AndroidShareIntent?.getPendingShare) {
    return;
  }
  if (!navigationRef.isReady() || !isRootMainTabs()) {
    return;
  }

  let pending: PendingShareNative | null;
  try {
    pending = await AndroidShareIntent.getPendingShare();
  } catch {
    return;
  }
  if (!pending) {
    return;
  }
  const initialComposeText = sharePayloadToComposeInput({
    subject: pending.subject ?? '',
    text: pending.text ?? '',
  });
  if (!initialComposeText.trim()) {
    return;
  }

  setPendingShareDraft(initialComposeText);
  /** Reset Inbox stack to `Inbox` so `InboxScreen` gains focus (consumes draft), even if the tab was already selected. */
  navigationRef.navigate('MainTabs', {
    screen: 'InboxTab',
    params: {screen: 'Inbox'},
  });
}

/** Debounced: avoid calling during the same state transition that triggered `onStateChange` (re-entrancy). */
export function scheduleTryConsumeAndroidShareNavigation(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    tryConsumeAndroidShareNavigation().catch(() => undefined);
  }, 120);
}

/** When returning from another app after [onNewIntent], consume share if vault is ready. */
export function AndroidShareIntentBridge() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        scheduleTryConsumeAndroidShareNavigation();
      }
      appState.current = next;
    });
    return () => {
      sub.remove();
    };
  }, []);

  return null;
}
