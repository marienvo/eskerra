import type {VaultMarkdownRef} from '@eskerra/core';
import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {QUICK_OPEN_SEARCH_DEBOUNCE_MS, useQuickOpenSearch} from './useQuickOpenSearch';

const VAULT = 'file:///v';
const REFS: VaultMarkdownRef[] = [
  {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
  {name: 'Beta', uri: 'file:///v/General/Beta.md'},
];

describe('useQuickOpenSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows no results before the first debounce fires', () => {
    const {result} = renderHook(
      ({search}) => useQuickOpenSearch(search, VAULT, REFS),
      {initialProps: {search: 'alp'}},
    );
    expect(result.current.searchPending).toBe(true);
    expect(result.current.displayed).toEqual([]);
  });

  it('updates displayed results after debounce', () => {
    const {result} = renderHook(
      ({search}) => useQuickOpenSearch(search, VAULT, REFS),
      {initialProps: {search: 'alp'}},
    );
    act(() => {
      vi.advanceTimersByTime(QUICK_OPEN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.searchPending).toBe(false);
    expect(result.current.displayed).toEqual([
      {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
    ]);
  });

  it('keeps previous results while a new query is pending (regression)', () => {
    const {result, rerender} = renderHook(
      ({search}) => useQuickOpenSearch(search, VAULT, REFS),
      {initialProps: {search: 'alp'}},
    );
    act(() => {
      vi.advanceTimersByTime(QUICK_OPEN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.displayed).toHaveLength(1);

    rerender({search: 'alpz'});
    expect(result.current.searchPending).toBe(true);
    expect(result.current.displayed).toEqual([
      {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
    ]);

    act(() => {
      vi.advanceTimersByTime(QUICK_OPEN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.searchPending).toBe(false);
    expect(result.current.displayed).toEqual([]);
  });

  it('clears results when search is cleared', async () => {
    const {result, rerender} = renderHook(
      ({search}) => useQuickOpenSearch(search, VAULT, REFS),
      {initialProps: {search: 'alp'}},
    );
    act(() => {
      vi.advanceTimersByTime(QUICK_OPEN_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.displayed).toHaveLength(1);

    rerender({search: ''});
    expect(result.current.searchTrimmed).toBe('');
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.displayed).toEqual([]);
  });
});
