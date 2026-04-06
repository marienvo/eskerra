import {load} from '@tauri-apps/plugin-store';

const STORE_PATH = 'eskerra-desktop.json';
const KEY_V4 = 'layoutPanelsV4';
const KEY_V3 = 'layoutPanelsV3';

/** Left column width in pixels (Vault, Episodes). The right column fills the rest. */
export type LeftSplitLayout = {
  leftWidthPx: number;
};

/** Right-side Notifications pane width (main | … | notifications | rail). */
export type NotificationsPanelLayout = {
  widthPx: number;
};

/** Vault pane height when Vault and Episodes are both visible (stacked in the left column). */
export type VaultEpisodesStackLayout = {
  topHeightPx: number;
};

export type StoredLayouts = {
  inbox: LeftSplitLayout;
  podcastsMain: LeftSplitLayout;
  notifications: NotificationsPanelLayout;
  vaultEpisodesStack: VaultEpisodesStackLayout;
};

export const INBOX_LEFT_PANEL = {
  defaultPx: 280,
  minPx: 160,
  maxPx: 520,
} as const;

export const PODCASTS_LEFT_PANEL = {
  defaultPx: 300,
  minPx: 180,
  maxPx: 560,
} as const;

export const NOTIFICATIONS_PANEL = {
  defaultPx: 280,
  minPx: 220,
  maxPx: 520,
} as const;

/** Vertical split between Vault (top) and Episodes (bottom) when both panes are visible. */
export const VAULT_EPISODES_STACK_TOP = {
  defaultPx: 280,
  minPx: 120,
  maxPx: 560,
} as const;

export const DEFAULT_LAYOUTS: StoredLayouts = {
  inbox: {leftWidthPx: INBOX_LEFT_PANEL.defaultPx},
  podcastsMain: {leftWidthPx: PODCASTS_LEFT_PANEL.defaultPx},
  notifications: {widthPx: NOTIFICATIONS_PANEL.defaultPx},
  vaultEpisodesStack: {topHeightPx: VAULT_EPISODES_STACK_TOP.defaultPx},
};

const ASSUMED_WIDTH_FOR_V3_MIGRATION = 1024;

function clampLeftWidth(
  px: number,
  minPx: number,
  maxPx: number,
  fallback: number,
): number {
  if (typeof px !== 'number' || !Number.isFinite(px)) {
    return fallback;
  }
  const r = Math.round(px);
  return Math.min(maxPx, Math.max(minPx, r));
}

function sanitizeInbox(layout: LeftSplitLayout | undefined): LeftSplitLayout {
  const fb = DEFAULT_LAYOUTS.inbox.leftWidthPx;
  if (!layout || typeof layout.leftWidthPx !== 'number') {
    return {leftWidthPx: fb};
  }
  return {
    leftWidthPx: clampLeftWidth(
      layout.leftWidthPx,
      INBOX_LEFT_PANEL.minPx,
      INBOX_LEFT_PANEL.maxPx,
      fb,
    ),
  };
}

function sanitizePodcastsMain(layout: LeftSplitLayout | undefined): LeftSplitLayout {
  const fb = DEFAULT_LAYOUTS.podcastsMain.leftWidthPx;
  if (!layout || typeof layout.leftWidthPx !== 'number') {
    return {leftWidthPx: fb};
  }
  return {
    leftWidthPx: clampLeftWidth(
      layout.leftWidthPx,
      PODCASTS_LEFT_PANEL.minPx,
      PODCASTS_LEFT_PANEL.maxPx,
      fb,
    ),
  };
}

function sanitizeNotifications(
  layout: NotificationsPanelLayout | undefined,
): NotificationsPanelLayout {
  const fb = DEFAULT_LAYOUTS.notifications.widthPx;
  if (!layout || typeof layout.widthPx !== 'number') {
    return {widthPx: fb};
  }
  return {
    widthPx: clampLeftWidth(
      layout.widthPx,
      NOTIFICATIONS_PANEL.minPx,
      NOTIFICATIONS_PANEL.maxPx,
      fb,
    ),
  };
}

function sanitizeVaultEpisodesStack(
  layout: VaultEpisodesStackLayout | undefined,
): VaultEpisodesStackLayout {
  const fb = DEFAULT_LAYOUTS.vaultEpisodesStack.topHeightPx;
  if (!layout || typeof layout.topHeightPx !== 'number') {
    return {topHeightPx: fb};
  }
  return {
    topHeightPx: clampLeftWidth(
      layout.topHeightPx,
      VAULT_EPISODES_STACK_TOP.minPx,
      VAULT_EPISODES_STACK_TOP.maxPx,
      fb,
    ),
  };
}

function isInboxV3Layout(v: unknown): v is {files: number; editor: number} {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return typeof o.files === 'number' && typeof o.editor === 'number';
}

function isPodcastsV3Layout(v: unknown): v is {episodes: number; rightCol: number} {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return typeof o.episodes === 'number' && typeof o.rightCol === 'number';
}

/** Exported for unit tests: migrate v3 percentage map to v4 pixel widths. */
export function migrateV3LayoutsToV4(raw: unknown): StoredLayouts | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Partial<{inbox: unknown; podcastsMain: unknown}>;
  if (!isInboxV3Layout(o.inbox) || !isPodcastsV3Layout(o.podcastsMain)) {
    return null;
  }
  const w = ASSUMED_WIDTH_FOR_V3_MIGRATION;
  const inboxPx = Math.round((o.inbox.files / 100) * w);
  const episodesPx = Math.round((o.podcastsMain.episodes / 100) * w);
  return {
    inbox: sanitizeInbox({leftWidthPx: inboxPx}),
    podcastsMain: sanitizePodcastsMain({leftWidthPx: episodesPx}),
    notifications: sanitizeNotifications(undefined),
    vaultEpisodesStack: sanitizeVaultEpisodesStack(undefined),
  };
}

function parseV4Payload(parsed: unknown): StoredLayouts | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const o = parsed as Partial<StoredLayouts>;
  if (o.inbox === undefined || o.podcastsMain === undefined) {
    return null;
  }
  const inbox = sanitizeInbox(o.inbox);
  const podcastsMain = sanitizePodcastsMain(o.podcastsMain);
  const notifications = sanitizeNotifications(o.notifications);
  const vaultEpisodesStack = sanitizeVaultEpisodesStack(o.vaultEpisodesStack);
  return {inbox, podcastsMain, notifications, vaultEpisodesStack};
}

export async function loadStoredLayouts(): Promise<StoredLayouts> {
  try {
    const store = await load(STORE_PATH);

    const rawV4 = await store.get<string>(KEY_V4);
    if (rawV4?.trim()) {
      try {
        const parsed = JSON.parse(rawV4) as unknown;
        const v4 = parseV4Payload(parsed);
        if (v4) {
          return v4;
        }
      } catch {
        /* fall through */
      }
    }

    const rawV3 = await store.get<string>(KEY_V3);
    if (rawV3?.trim()) {
      try {
        const parsed = JSON.parse(rawV3) as unknown;
        const migrated = migrateV3LayoutsToV4(parsed);
        if (migrated) {
          await store.set(KEY_V4, JSON.stringify(migrated));
          await store.delete(KEY_V3);
          await store.save();
          return migrated;
        }
      } catch {
        /* fall through */
      }
    }

    return DEFAULT_LAYOUTS;
  } catch {
    return DEFAULT_LAYOUTS;
  }
}

export async function saveStoredLayouts(layouts: StoredLayouts): Promise<void> {
  const store = await load(STORE_PATH);
  const normalized: StoredLayouts = {
    inbox: sanitizeInbox(layouts.inbox),
    podcastsMain: sanitizePodcastsMain(layouts.podcastsMain),
    notifications: sanitizeNotifications(layouts.notifications),
    vaultEpisodesStack: sanitizeVaultEpisodesStack(layouts.vaultEpisodesStack),
  };
  await store.set(KEY_V4, JSON.stringify(normalized));
  await store.save();
}
