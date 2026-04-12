import * as Sentry from '@sentry/react';
import type {Breadcrumb, ErrorEvent, Event, EventHint} from '@sentry/core';

import {isObservabilityDisabled} from './env';
import {scrubString} from './redact';

import packageJson from '../../package.json';

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

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

function init(): void {
  if (isObservabilityDisabled()) {
    return;
  }
  if (!dsn) {
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.DEV ? 'development' : 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      release: `eskerra-desktop@${packageJson.version}`,
      beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
        return scrubEvent(event as unknown as Event) as ErrorEvent;
      },
      beforeBreadcrumb(crumb: Breadcrumb) {
        return scrubBreadcrumb(crumb);
      },
    });
  } catch (error) {
    console.error('[eskerra:Sentry] desktop init failed', error);
  }
}

init();
