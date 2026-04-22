import {isObservabilityDisabled} from './env';
import {reportCrash} from './reportCrash';

/**
 * Forwards non-React errors (async callbacks, event handlers, promise rejections) to
 * {@link reportCrash} so they land in console, Sentry, and the on-disk crash log.
 */
export function registerGlobalErrorHandlers(): void {
  if (isObservabilityDisabled()) {
    return;
  }

  window.addEventListener('error', event => {
    const error = event.error ?? event.message ?? 'Unknown window error';
    reportCrash('window.error', error);
  });

  window.addEventListener('unhandledrejection', event => {
    reportCrash('unhandledrejection', event.reason);
  });
}
