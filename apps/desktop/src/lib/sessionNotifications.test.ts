import {describe, expect, it} from 'vitest';

import type {SessionNotification} from './sessionNotifications';
import {
  SESSION_NOTIF_RENAME_PROGRESS_ID,
  appendNotification,
  removeNotificationById,
  shouldSkipDuplicateStatusAppend,
  statusMessageSignature,
  upsertRenameProgressItem,
} from './sessionNotifications';

describe('sessionNotifications', () => {
  it('statusMessageSignature is stable for dedupe', () => {
    expect(statusMessageSignature('error', 'x')).toBe(statusMessageSignature('error', 'x'));
    expect(statusMessageSignature('error', 'x')).not.toBe(statusMessageSignature('info', 'x'));
    expect(statusMessageSignature('error', 'x')).not.toBe(statusMessageSignature('error', 'y'));
  });

  it('shouldSkipDuplicateStatusAppend skips identical tone+text', () => {
    const sig = statusMessageSignature('info', 'hello');
    expect(shouldSkipDuplicateStatusAppend(null, 'info', 'hello')).toBe(false);
    expect(shouldSkipDuplicateStatusAppend(sig, 'info', 'hello')).toBe(true);
    expect(shouldSkipDuplicateStatusAppend(sig, 'info', 'hello2')).toBe(false);
  });

  it('upsertRenameProgressItem appends then updates in place', () => {
    const a = upsertRenameProgressItem([], 'Updating links… 1/10');
    expect(a).toHaveLength(1);
    expect(a[0]?.id).toBe(SESSION_NOTIF_RENAME_PROGRESS_ID);
    expect(a[0]?.text).toBe('Updating links… 1/10');

    const b = upsertRenameProgressItem(a, 'Updating links… 2/10');
    expect(b).toHaveLength(1);
    expect(b[0]?.text).toBe('Updating links… 2/10');
  });

  it('appendNotification and removeNotificationById', () => {
    const one: SessionNotification = {
      id: '1',
      tone: 'error',
      text: 'e',
      source: 'status',
    };
    const items = appendNotification([], one);
    expect(items).toHaveLength(1);
    expect(removeNotificationById(items, '1')).toHaveLength(0);
  });
});
