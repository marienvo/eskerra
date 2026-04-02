import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createInboxAutosaveScheduler} from './inboxAutosaveScheduler';

describe('createInboxAutosaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the callback once after debounce when the user stops scheduling', () => {
    const s = createInboxAutosaveScheduler(400);
    const fn = vi.fn();
    s.schedule(fn);
    s.schedule(fn);
    s.schedule(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents the pending callback from running', () => {
    const s = createInboxAutosaveScheduler(400);
    const fn = vi.fn();
    s.schedule(fn);
    s.cancel();
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
  });

  it('allows scheduling again after cancel', () => {
    const s = createInboxAutosaveScheduler(400);
    const fn = vi.fn();
    s.schedule(fn);
    s.cancel();
    s.schedule(fn);
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
