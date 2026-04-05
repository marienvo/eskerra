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
        return scrubEvent(event as unknown as Event) as ErrorEvent;
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
    Sentry.withScope(scope => {
      scope.setExtra('ring_tail', JSON.stringify(tail).slice(0, 8000));
      scope.setFingerprint(['ring-buffer-tail']);
      Sentry.captureMessage('eskerra.ring_buffer.tail', 'info');
    });
    await setLastRingSentTimestamp(Date.now());
  } catch {
    // ignore
  }
}

init();
