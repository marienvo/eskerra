import {
  consumePendingShareDraft,
  hasPendingShareDraft,
  setPendingShareDraft,
} from '../src/core/share/pendingShareDraft';

describe('pendingShareDraft', () => {
  beforeEach(() => {
    consumePendingShareDraft();
  });

  it('set then consume returns text and clears', () => {
    setPendingShareDraft('hello');
    expect(hasPendingShareDraft()).toBe(true);
    expect(consumePendingShareDraft()).toBe('hello');
    expect(consumePendingShareDraft()).toBe(null);
    expect(hasPendingShareDraft()).toBe(false);
  });

  it('empty or whitespace-only does not set draft', () => {
    setPendingShareDraft('');
    expect(hasPendingShareDraft()).toBe(false);
    setPendingShareDraft('   ');
    expect(hasPendingShareDraft()).toBe(false);
  });

  it('consume without set returns null', () => {
    expect(consumePendingShareDraft()).toBe(null);
  });
});
