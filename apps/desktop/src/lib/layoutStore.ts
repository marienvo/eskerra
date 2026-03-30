import {load} from '@tauri-apps/plugin-store';
import type {Layout} from 'react-resizable-panels';

const STORE_PATH = 'notebox-desktop.json';
const KEY = 'layoutPanelsV3';

export type StoredLayouts = {
  inbox: Layout;
  podcastsMain: Layout;
};

export const DEFAULT_LAYOUTS: StoredLayouts = {
  inbox: {editor: 70, files: 30},
  podcastsMain: {episodes: 38, rightCol: 62},
};

const INBOX_IDS = ['files', 'editor'] as const;
const PODCASTS_MAIN_IDS = ['episodes', 'rightCol'] as const;
function sanitizeLayout(
  layout: Layout | undefined,
  requiredIds: readonly string[],
  fallback: Layout,
): Layout {
  if (!layout || typeof layout !== 'object') {
    return fallback;
  }
  const out: Layout = {};
  for (const id of requiredIds) {
    const v = layout[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 8 || v > 92) {
      return fallback;
    }
    out[id] = v;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1.5) {
    return fallback;
  }
  return out;
}

export async function loadStoredLayouts(): Promise<StoredLayouts> {
  try {
    const store = await load(STORE_PATH);
    const raw = await store.get<string>(KEY);
    if (!raw?.trim()) {
      return DEFAULT_LAYOUTS;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_LAYOUTS;
    }
    const o = parsed as Partial<StoredLayouts>;
    return {
      inbox: sanitizeLayout(o.inbox, INBOX_IDS, DEFAULT_LAYOUTS.inbox),
      podcastsMain: sanitizeLayout(o.podcastsMain, PODCASTS_MAIN_IDS, DEFAULT_LAYOUTS.podcastsMain),
    };
  } catch {
    return DEFAULT_LAYOUTS;
  }
}

export async function saveStoredLayouts(layouts: StoredLayouts): Promise<void> {
  const store = await load(STORE_PATH);
  await store.set(KEY, JSON.stringify(layouts));
  await store.save();
}
