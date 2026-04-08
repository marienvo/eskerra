import {load} from '@tauri-apps/plugin-store';

export const MAIN_WINDOW_UI_STORE_PATH = 'eskerra-desktop.json';
export const MAIN_WINDOW_UI_KEY = 'mainWindowUiV1';

/** @deprecated Legacy field; migrated to `vaultPaneVisible` / `episodesPaneVisible` on load. */
export type MainTabId = 'podcasts' | 'inbox';

export type StoredMainWindowInbox = {
  composingNewEntry: boolean;
  selectedUri: string | null;
  /** Open editor tabs (vault markdown URIs); optional for backward compatibility. */
  openTabUris?: string[];
  /**
   * IDE-style tabs with per-tab back/forward stacks. When present, preferred over `openTabUris`.
   */
  editorWorkspaceTabs?: Array<{id: string; entries: string[]; index: number}>;
  activeEditorTabId?: string | null;
};

export type StoredMainWindowUi = {
  vaultRoot: string;
  /** When true, the vault tree column is shown to the left of the editor. */
  vaultPaneVisible: boolean;
  /** When true, the episodes list column is shown (left of the editor, or between vault and editor). */
  episodesPaneVisible: boolean;
  /** Notifications pane open (list is always session-only). */
  notificationsPanelVisible: boolean;
  inbox: StoredMainWindowInbox;
};

const DEFAULT_INBOX: StoredMainWindowInbox = {
  composingNewEntry: false,
  selectedUri: null,
};

/** Default matches the former `mainTab` default of `podcasts`. */
export const DEFAULT_MAIN_WINDOW_PANE_VISIBILITY: {
  vaultPaneVisible: boolean;
  episodesPaneVisible: boolean;
} = {
  vaultPaneVisible: false,
  episodesPaneVisible: true,
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

  let vaultPaneVisible = DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.vaultPaneVisible;
  let episodesPaneVisible = DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.episodesPaneVisible;

  const v = o.vaultPaneVisible;
  const e = o.episodesPaneVisible;
  if (typeof v === 'boolean' && typeof e === 'boolean') {
    vaultPaneVisible = v;
    episodesPaneVisible = e;
  } else {
    let legacyTab: MainTabId = 'podcasts';
    if (o.mainTab === 'inbox' || o.mainTab === 'podcasts') {
      legacyTab = o.mainTab;
    }
    if (legacyTab === 'inbox') {
      vaultPaneVisible = true;
      episodesPaneVisible = false;
    } else {
      vaultPaneVisible = false;
      episodesPaneVisible = true;
    }
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
    if (Array.isArray(ib.editorWorkspaceTabs)) {
      const tabs: NonNullable<StoredMainWindowInbox['editorWorkspaceTabs']> = [];
      for (const rawTab of ib.editorWorkspaceTabs) {
        if (rawTab === null || typeof rawTab !== 'object' || Array.isArray(rawTab)) {
          continue;
        }
        const t = rawTab as Record<string, unknown>;
        const id = typeof t.id === 'string' ? t.id.trim() : '';
        if (!id) {
          continue;
        }
        const entries: string[] = [];
        if (Array.isArray(t.entries)) {
          for (const e of t.entries) {
            if (typeof e === 'string') {
              const u = e.trim().replace(/\\/g, '/');
              if (u) {
                entries.push(u);
              }
            }
          }
        }
        if (entries.length === 0) {
          continue;
        }
        let index =
          typeof t.index === 'number' && Number.isFinite(t.index)
            ? Math.floor(t.index)
            : 0;
        if (index < 0 || index >= entries.length) {
          index = entries.length - 1;
        }
        tabs.push({id, entries, index});
      }
      if (tabs.length > 0) {
        inbox.editorWorkspaceTabs = tabs;
      }
    }
    if (ib.activeEditorTabId === null) {
      inbox.activeEditorTabId = null;
    } else if (typeof ib.activeEditorTabId === 'string') {
      const id = ib.activeEditorTabId.trim();
      inbox.activeEditorTabId = id === '' ? null : id;
    }
  }

  return {
    vaultRoot,
    vaultPaneVisible,
    episodesPaneVisible,
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
