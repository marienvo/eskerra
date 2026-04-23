import * as Sentry from '@sentry/react-native';
import type {Breadcrumb, ErrorEvent, Event, EventHint} from '@sentry/core';

import {isObservabilityDisabled} from './env';
import {scrubString} from './redact';
import {SENTRY_DSN} from './sentryDsn';
import {
  getLastRingSentTimestamp,
  readPersistedRingTail,
  RING_TAIL_RESEND_COOLDOWN_MS,
  setLastRingSentTimestamp,
} from './ringBuffer';

import packageJson from '../../../package.json';

type RingTailSentryContext = {
  line_count: number;
  tail_json: string;
};

/** Set in {@link attachRingBufferTailOnce}; cleared after first delivered error that carries the tail. */
let pendingRingTailForSentry: RingTailSentryContext | null = null;

function scrubEvent(event: Event): Event {
  if (event.type === 'transaction') {
    return event;
  }
  if (event.message) {
    event.message = scrubString(event.message);
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (value.value) {
        value.value = scrubString(value.value);
      }
    }
  }
  return event;
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.message) {
    crumb.message = scrubString(crumb.message, 500);
  }
  if (crumb.data && typeof crumb.data === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(crumb.data)) {
      if (typeof value === 'string') {
        next[key] = scrubString(value, 500);
      } else {
        next[key] = value;
      }
    }
    crumb.data = next;
  }
  return crumb;
}

function init(): void {
  if (isObservabilityDisabled()) {
    return;
  }
  if (!SENTRY_DSN?.trim()) {
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      sendDefaultPii: false,
      /**
       * Android: attach all threads to logged events for ANR/error triage (e.g. REACT-NATIVE-3)
       * without enabling performance transactions (Phase 1 keeps tracesSampleRate: 0).
       */
      attachThreads: true,
      enableAutoPerformanceTracing: false,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableAppHangTracking: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
      patchGlobalPromise: true,
      release: `eskerra@${packageJson.version}`,
      beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
        const scrubbed = scrubEvent(event as unknown as Event) as ErrorEvent;
        if (scrubbed.type === 'transaction') {
          return scrubbed;
        }
        const hadPendingTail = pendingRingTailForSentry != null;
        const existingTail = scrubbed.contexts?.ring_buffer_tail as
          | RingTailSentryContext
          | undefined;
        if (
          pendingRingTailForSentry &&
          (existingTail == null || existingTail.tail_json == null)
        ) {
          scrubbed.contexts = {
            ...scrubbed.contexts,
            ring_buffer_tail: pendingRingTailForSentry,
          };
        }
        const tailOnOut = scrubbed.contexts?.ring_buffer_tail as
          | RingTailSentryContext
          | undefined;
        if (
          hadPendingTail &&
          tailOnOut?.tail_json != null &&
          tailOnOut.tail_json.length > 0
        ) {
          setLastRingSentTimestamp(Date.now()).catch(() => undefined);
          pendingRingTailForSentry = null;
        }
        return scrubbed;
      },
      beforeBreadcrumb(crumb: Breadcrumb) {
        return scrubBreadcrumb(crumb);
      },
    });
  } catch (error) {
      console.error('[eskerra:Sentry] init failed', error);
    return;
  }

  attachRingBufferTailOnce().catch(() => undefined);
}

async function attachRingBufferTailOnce(): Promise<void> {
  try {
    const last = await getLastRingSentTimestamp();
    if (last && Date.now() - last < RING_TAIL_RESEND_COOLDOWN_MS) {
      return;
    }
    const tail = await readPersistedRingTail(80);
    if (tail.length === 0) {
      return;
    }
    // Do not use `captureMessage`: Sentry groups info-level messages as issues (e.g. REACT-NATIVE-2).
    // Attach tail to scope so the next real error includes it for triage. Persist
    // {@link setLastRingSentTimestamp} only from `beforeSend` once an error actually carries the
    // payload — otherwise a restart before any send would keep the cooldown but lose in-memory
    // scope context, suppressing re-attachment incorrectly.
    const tailJson = JSON.stringify(tail).slice(0, 8000);
    const payload: RingTailSentryContext = {
      line_count: tail.length,
      tail_json: tailJson,
    };
    pendingRingTailForSentry = payload;
    Sentry.setContext('ring_buffer_tail', payload);
    Sentry.addBreadcrumb({
      category: 'eskerra.observability',
      level: 'info',
      message: 'ring_buffer_tail_loaded',
      data: {line_count: tail.length},
    });
  } catch {
    // ignore
  }
}

init();
