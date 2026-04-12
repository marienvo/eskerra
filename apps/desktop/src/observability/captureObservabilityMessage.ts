import * as Sentry from '@sentry/react';

import {getSentryClient} from './sentryClient';

export function captureObservabilityMessage(input: {
  message: string;
  level: 'warning' | 'info';
  extra?: Record<string, unknown>;
  fingerprint?: string[];
}): void {
  if (!getSentryClient()) {
    return;
  }
  Sentry.withScope(scope => {
    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        scope.setExtra(k, v);
      }
    }
    if (input.fingerprint) {
      scope.setFingerprint(input.fingerprint);
    }
    Sentry.captureMessage(input.message, input.level);
  });
}
