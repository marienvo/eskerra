import type {VaultMarkdownRef} from '@eskerra/core';
import {useEffect, useMemo, useState} from 'react';

import {filterVaultNotesForQuickOpen} from '../lib/quickOpenNoteFilter';

export const QUICK_OPEN_SEARCH_DEBOUNCE_MS = 300;

/**
 * Debounced quick-open query over vault note refs. Keeps showing the last applied
 * filter results while the user types (until debounce catches up), matching full
 * vault search UX.
 */
export function useQuickOpenSearch(
  search: string,
  vaultRoot: string,
  refs: readonly VaultMarkdownRef[],
) {
  const [appliedQuery, setAppliedQuery] = useState('');
  const searchTrimmed = search.trim();

  useEffect(() => {
    if (!searchTrimmed) {
      setAppliedQuery('');
      return;
    }
    const t = window.setTimeout(() => {
      setAppliedQuery(searchTrimmed);
    }, QUICK_OPEN_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search, searchTrimmed]);

  const filtered = useMemo(
    () => filterVaultNotesForQuickOpen(appliedQuery, vaultRoot, refs),
    [appliedQuery, refs, vaultRoot],
  );

  const searchPending =
    searchTrimmed.length > 0 && appliedQuery !== searchTrimmed;

  const displayed = filtered;

  return {displayed, searchPending, searchTrimmed};
}
