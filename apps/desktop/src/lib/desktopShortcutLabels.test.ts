import {afterEach, describe, expect, it, vi} from 'vitest';

import {reopenClosedTabMenuShortcutLabel} from './desktopShortcutLabels';

describe('reopenClosedTabMenuShortcutLabel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns Ctrl+Shift+T for Linux', () => {
    vi.stubGlobal('navigator', {
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 X11; Linux',
    });
    expect(reopenClosedTabMenuShortcutLabel()).toBe('Ctrl+Shift+T');
  });

  it('returns ⌘⇧T for macOS', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 Macintosh',
    });
    expect(reopenClosedTabMenuShortcutLabel()).toBe('⌘⇧T');
  });
});
