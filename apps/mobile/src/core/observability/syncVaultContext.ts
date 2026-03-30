import {getClient, setContext} from '@sentry/react-native';

import {isObservabilityDisabled} from './env';

/**
 * Updates Sentry scope with coarse vault state (no URIs).
 */
export function syncVaultSessionContext(hasSession: boolean): void {
  if (isObservabilityDisabled() || !getClient()) {
    return;
  }
  setContext('vault', {
    has_session: hasSession,
  });
}
