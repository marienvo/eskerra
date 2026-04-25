import {renderHook, act} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useResolvedChromeMode} from './useResolvedChromeMode';

describe('useResolvedChromeMode', () => {
  const darkSchemeListener = {current: null as (() => void) | null};

  beforeEach(() => {
    darkSchemeListener.current = null;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return false;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => {
          if (query === '(prefers-color-scheme: dark)') {
            darkSchemeListener.current = fn;
          }
        },
        removeEventListener: () => {
          darkSchemeListener.current = null;
        },
      })),
    );
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
    const listener = {current: null as (() => void) | null};
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
            listener.current = fn;
          },
          removeEventListener: () => {
            listener.current = null;
          },
        };
        return mq;
      }),
    );

    const {result} = renderHook(() => useResolvedChromeMode('auto'));
    expect(result.current).toBe('dark');

    act(() => {
      prefersDark = false;
      listener.current?.();
    });
    expect(result.current).toBe('light');
  });
});
