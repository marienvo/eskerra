import AsyncStorage from '@react-native-async-storage/async-storage';

import {isObservabilityDisabled} from './env';

const STORAGE_KEY = 'eskerra.observability.ring.v1';
const LAST_SENT_KEY = 'eskerra.observability.ring.lastSentAt';
const MAX_LINES = 400;
const MAX_CHARS = 480_000;
const FLUSH_DEBOUNCE_MS = 400;
export const RING_TAIL_RESEND_COOLDOWN_MS = 4 * 60 * 60 * 1000;

type RingLine = {
  ts: number;
  level: 'info' | 'error';
  category: string;
  message: string;
  data?: Record<string, unknown>;
};

let pending: RingLine[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (isObservabilityDisabled()) {
    return;
  }
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk().catch(() => undefined);
  }, FLUSH_DEBOUNCE_MS);
}

async function flushToDisk(): Promise<void> {
  if (pending.length === 0) {
    return;
  }
  const batch = pending;
  pending = [];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const prev: RingLine[] = raw ? (JSON.parse(raw) as RingLine[]) : [];
    const next = prev.concat(batch);
    while (next.length > MAX_LINES) {
      next.shift();
    }
    let serialized = JSON.stringify(next);
    while (serialized.length > MAX_CHARS && next.length > 1) {
      next.shift();
      serialized = JSON.stringify(next);
    }
    await AsyncStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Never block app on ring buffer failures.
  }
}

/**
 * Queues a structured line for persisted ring storage (debounced flush).
 */
export function enqueueRingLine(line: RingLine): void {
  if (isObservabilityDisabled()) {
    return;
  }
  pending.push(line);
  scheduleFlush();
}

export async function readPersistedRingTail(maxLines = 80): Promise<RingLine[]> {
  if (isObservabilityDisabled()) {
    return [];
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) {
      return [];
    }
    const lines = JSON.parse(raw) as RingLine[];
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export async function getLastRingSentTimestamp(): Promise<number> {
  try {
    const lastSentRaw = await AsyncStorage.getItem(LAST_SENT_KEY);
    return lastSentRaw ? Number(lastSentRaw) : 0;
  } catch {
    return 0;
  }
}

export async function setLastRingSentTimestamp(now: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SENT_KEY, String(now));
  } catch {
    // ignore
  }
}
