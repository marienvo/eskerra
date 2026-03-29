import {captureException, getClient, withScope} from '@sentry/react-native';

import {isObservabilityDisabled} from './env';

/**
 * Reports an unexpected error once to Sentry with flow/step tags. Do not use for expected user cancels.
 */
export function reportUnexpectedError(
  error: unknown,
  context: {flow: string; step?: string},
): void {
  if (isObservabilityDisabled() || !getClient()) {
    return;
  }
  const err = error instanceof Error ? error : new Error(String(error));
  withScope(scope => {
    scope.setTag('flow', context.flow);
    if (context.step) {
      scope.setTag('step', context.step);
    }
    captureException(err);
  });
}
