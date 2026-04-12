import * as Sentry from '@sentry/react';

export function getSentryClient(): ReturnType<typeof Sentry.getClient> {
  return Sentry.getClient();
}

export {captureException, withScope} from '@sentry/react';
