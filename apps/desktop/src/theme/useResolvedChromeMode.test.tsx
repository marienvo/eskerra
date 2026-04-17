import {renderHook, act} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useResolvedChromeMode} from './useResolvedChromeMode';

describe('useResolvedChromeMode', () => {
  let listener: (() => void) | null = null;

  beforeEach(() => {
    listener = null;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return query === '(prefers-color-scheme: dark)' ? false : false;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => {
          if (query === '(prefers-color-scheme: dark)') {
            listener = fn;
          }
        },
        removeEventListener: () => {
          listener = null;
        },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns light and dark for fixed modes', () => {
    expect(renderHook(() => useResolvedChromeMode('light')).result.current).toBe('light');
    expect(renderHook(() => useResolvedChromeMode('dark')).result.current).toBe('dark');
  });

  it('uses prefers-color-scheme: dark false as light in auto', () => {
    const {result} = renderHook(() => useResolvedChromeMode('auto'));
    expect(result.current).toBe('light');
  });

  it('updates when prefers-color-scheme changes in auto', () => {
    let prefersDark = true;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        if (query !== '(prefers-color-scheme: dark)') {
          return {matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()};
        }
        const mq = {
          get matches() {
            return prefersDark;
          },
          media: query,
          addEventListener: (_: string, fn: () => void) => {
            listener = fn;
          },
          removeEventListener: () => {
            listener = null;
          },
        };
        return mq;
      }),
    );

    const {result} = renderHook(() => useResolvedChromeMode('auto'));
    expect(result.current).toBe('dark');

    act(() => {
      prefersDark = false;
      listener?.();
    });
    expect(result.current).toBe('light');
  });
});
