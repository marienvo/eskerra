import {load} from '@tauri-apps/plugin-store';

/** Same file as layout / main window UI — not the vault. */
export const EMOJI_USAGE_STORE_PATH = 'eskerra-desktop.json';
export const EMOJI_USAGE_STORE_KEY = 'emojiUsageV1';

export const EMOJI_USAGE_MAX_SHORTCODES = 300;

export const EMOJI_USAGE_DEBOUNCE_SAVE_MS = 1500;

type EmojiUsagePayloadV1 = {
  readonly v: 1;
  readonly counts: Readonly<Record<string, number>>;
};

const counts = new Map<string, number>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeShortcodeKey(shortcode: string): string {
  return shortcode.trim().toLowerCase();
}

/** Keep top `maxKeys` entries by count (then key) when trimming loaded data. */
export function capEmojiUsageCounts(
  raw: Readonly<Record<string, number>>,
  maxKeys: number,
): Record<string, number> {
  const entries = Object.entries(raw).filter(
    ([k, n]) =>
      typeof k === 'string'
      && k.length > 0
      && typeof n === 'number'
      && Number.isFinite(n)
      && n > 0,
  );
  if (entries.length <= maxKeys) {
    const out: Record<string, number> = {};
    for (const [k, n] of entries) {
      out[normalizeShortcodeKey(k)] = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
    }
    return out;
  }
  entries.sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  const out: Record<string, number> = {};
  for (const [k, n] of entries.slice(0, maxKeys)) {
    out[normalizeShortcodeKey(k)] = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
  }
  return out;
}

export function parseEmojiUsagePayload(parsed: unknown): Record<string, number> | null {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) {
    return null;
  }
  if (o.counts === null || typeof o.counts !== 'object' || Array.isArray(o.counts)) {
    return null;
  }
  return capEmojiUsageCounts(o.counts as Record<string, number>, EMOJI_USAGE_MAX_SHORTCODES);
}

/**
 * Drop one existing key with the lowest count (lexicographically smallest key on ties).
 * Call only when `map.size >= maxKeys` and a new key will be added.
 */
export function evictLowestCountKey(map: Map<string, number>, maxKeys: number): void {
  if (map.size < maxKeys) {
    return;
  }
  let victim: string | null = null;
  let victimCount = Number.POSITIVE_INFINITY;
  for (const [k, n] of map) {
    if (
      victim === null
      || n < victimCount
      || (n === victimCount && k.localeCompare(victim) < 0)
    ) {
      victim = k;
      victimCount = n;
    }
  }
  if (victim !== null) {
    map.delete(victim);
  }
}

export function getEmojiUsageCount(shortcode: string): number {
  return counts.get(normalizeShortcodeKey(shortcode)) ?? 0;
}

async function flushEmojiUsageToStore(): Promise<void> {
  try {
    const store = await load(EMOJI_USAGE_STORE_PATH);
    const payload: EmojiUsagePayloadV1 = {
      v: 1,
      counts: Object.fromEntries(
        [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    };
    await store.set(EMOJI_USAGE_STORE_KEY, JSON.stringify(payload));
    await store.save();
  } catch {
    /* Store unavailable (e.g. plain web dev) — ignore. */
  }
}

function scheduleEmojiUsageSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushEmojiUsageToStore();
  }, EMOJI_USAGE_DEBOUNCE_SAVE_MS);
}

export function recordEmojiUsage(shortcode: string): void {
  const k = normalizeShortcodeKey(shortcode);
  if (k.length === 0) {
    return;
  }
  if (!counts.has(k) && counts.size >= EMOJI_USAGE_MAX_SHORTCODES) {
    evictLowestCountKey(counts, EMOJI_USAGE_MAX_SHORTCODES);
  }
  counts.set(k, Math.min(Number.MAX_SAFE_INTEGER, (counts.get(k) ?? 0) + 1));
  scheduleEmojiUsageSave();
}

export async function hydrateEmojiUsageFromStore(): Promise<void> {
  try {
    const store = await load(EMOJI_USAGE_STORE_PATH);
    const raw = await store.get<string>(EMOJI_USAGE_STORE_KEY);
    if (typeof raw !== 'string' || !raw.trim()) {
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    const capped = parseEmojiUsagePayload(parsed);
    if (!capped) {
      return;
    }
    counts.clear();
    for (const [k, n] of Object.entries(capped)) {
      counts.set(k, n);
    }
  } catch {
    /* Ignore corrupt or missing store. */
  }
}

/** Vitest harness: clears in-memory counts and pending debounced save timer. */
export function __resetForTests(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  counts.clear();
}
