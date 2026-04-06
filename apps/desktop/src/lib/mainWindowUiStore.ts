import {load} from '@tauri-apps/plugin-store';

export const MAIN_WINDOW_UI_STORE_PATH = 'eskerra-desktop.json';
export const MAIN_WINDOW_UI_KEY = 'mainWindowUiV1';

export type MainTabId = 'podcasts' | 'inbox';

export type StoredMainWindowInbox = {
  composingNewEntry: boolean;
  selectedUri: string | null;
  /** Open editor tabs (vault markdown URIs); optional for backward compatibility. */
  openTabUris?: string[];
};

export type StoredMainWindowUi = {
  vaultRoot: string;
  mainTab: MainTabId;
  /** Notifications pane open (list is always session-only). */
  notificationsPanelVisible: boolean;
  inbox: StoredMainWindowInbox;
};

const DEFAULT_INBOX: StoredMainWindowInbox = {
  composingNewEntry: false,
  selectedUri: null,
};

/** Pure parse + sanitize for tests and for store values. */
export function normalizeMainWindowUiPayload(parsed: unknown): StoredMainWindowUi | null {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  const vaultRoot = typeof o.vaultRoot === 'string' ? o.vaultRoot.trim() : '';
  if (!vaultRoot) {
    return null;
  }

  let mainTab: MainTabId = 'podcasts';
  if (o.mainTab === 'inbox' || o.mainTab === 'podcasts') {
    mainTab = o.mainTab;
  }

  let notificationsPanelVisible = true;
  if (typeof o.notificationsPanelVisible === 'boolean') {
    notificationsPanelVisible = o.notificationsPanelVisible;
  }

  const inbox: StoredMainWindowInbox = {...DEFAULT_INBOX};
  if (o.inbox !== null && typeof o.inbox === 'object' && !Array.isArray(o.inbox)) {
    const ib = o.inbox as Record<string, unknown>;
    if (typeof ib.composingNewEntry === 'boolean') {
      inbox.composingNewEntry = ib.composingNewEntry;
    }
    if (ib.selectedUri === null) {
      inbox.selectedUri = null;
    } else if (typeof ib.selectedUri === 'string') {
      const t = ib.selectedUri.trim();
      inbox.selectedUri = t === '' ? null : t;
    }
    if (Array.isArray(ib.openTabUris)) {
      const uris: string[] = [];
      for (const item of ib.openTabUris) {
        if (typeof item === 'string') {
          const u = item.trim();
          if (u) {
            uris.push(u);
          }
        }
      }
      if (uris.length > 0) {
        inbox.openTabUris = uris;
      }
    }
  }

  return {
    vaultRoot,
    mainTab,
    notificationsPanelVisible,
    inbox,
  };
}

export async function loadMainWindowUi(): Promise<StoredMainWindowUi | null> {
  try {
    const store = await load(MAIN_WINDOW_UI_STORE_PATH);
    const raw = await store.get<string>(MAIN_WINDOW_UI_KEY);
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return normalizeMainWindowUiPayload(parsed);
  } catch {
    return null;
  }
}

export async function saveMainWindowUi(ui: StoredMainWindowUi): Promise<void> {
  const store = await load(MAIN_WINDOW_UI_STORE_PATH);
  await store.set(MAIN_WINDOW_UI_KEY, JSON.stringify(ui));
  await store.save();
}
