import {beforeEach, describe, expect, it, vi} from 'vitest';

const {sentryScope, sentryCaptureMessage, sentryWithScope, getSentryClient} =
  vi.hoisted(() => {
    const scope = {
      setExtra: vi.fn(),
      setFingerprint: vi.fn(),
      setTag: vi.fn(),
    };
    const captureMessage = vi.fn();
    const withScope = vi.fn((cb: (s: typeof scope) => void) => {
      cb(scope);
    });
    return {
      sentryScope: scope,
      sentryCaptureMessage: captureMessage,
      sentryWithScope: withScope,
      getSentryClient: vi.fn(),
    };
  });

vi.mock('@sentry/react', () => ({
  withScope: sentryWithScope,
  captureMessage: sentryCaptureMessage,
}));

vi.mock('./sentryClient', () => ({
  getSentryClient,
}));

import {captureObservabilityMessage} from './captureObservabilityMessage';

describe('captureObservabilityMessage', () => {
  beforeEach(() => {
    sentryScope.setExtra.mockReset();
    sentryScope.setFingerprint.mockReset();
    sentryScope.setTag.mockReset();
    sentryCaptureMessage.mockReset();
    sentryWithScope.mockClear();
    getSentryClient.mockReset();
  });

  it('does nothing when no Sentry client is active', () => {
    getSentryClient.mockReturnValue(null);
    captureObservabilityMessage({
      message: 'eskerra.desktop.test',
      level: 'warning',
    });
    expect(sentryWithScope).not.toHaveBeenCalled();
    expect(sentryCaptureMessage).not.toHaveBeenCalled();
  });

  it('forwards extras, fingerprint, and tags', () => {
    getSentryClient.mockReturnValue({});
    captureObservabilityMessage({
      message: 'eskerra.desktop.vault_watch_coarse_invalidation',
      level: 'warning',
      extra: {pathCount: 3, reason: 'notify_error:poll:overflow'},
      tags: {
        obs_surface: 'vault_watch',
        watch_session_id: 'session-1',
      },
      fingerprint: ['eskerra.desktop', 'vault_watch_coarse_invalidation'],
    });

    expect(sentryWithScope).toHaveBeenCalledTimes(1);
    expect(sentryScope.setExtra).toHaveBeenCalledWith('pathCount', 3);
    expect(sentryScope.setExtra).toHaveBeenCalledWith(
      'reason',
      'notify_error:poll:overflow',
    );
    expect(sentryScope.setTag).toHaveBeenCalledWith('obs_surface', 'vault_watch');
    expect(sentryScope.setTag).toHaveBeenCalledWith(
      'watch_session_id',
      'session-1',
    );
    expect(sentryScope.setFingerprint).toHaveBeenCalledWith([
      'eskerra.desktop',
      'vault_watch_coarse_invalidation',
    ]);
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      'eskerra.desktop.vault_watch_coarse_invalidation',
      'warning',
    );
  });
});
