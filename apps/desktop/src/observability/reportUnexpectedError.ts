import * as Sentry from '@sentry/react';

import {isObservabilityDisabled} from './env';
import {getSentryClient} from './sentryClient';

/**
 * Reports an unexpected error once to Sentry with flow/step tags.
 * Do not use for expected user cancels.
 */
export function reportUnexpectedError(
  error: unknown,
  context: {flow: string; step?: string},
): void {
  if (isObservabilityDisabled() || !getSentryClient()) {
    return;
  }
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope(scope => {
    scope.setTag('flow', context.flow);
    if (context.step) {
      scope.setTag('step', context.step);
    }
    Sentry.captureException(err);
  });
}
