import * as Dialog from '@radix-ui/react-dialog';
import {Command, CommandEmpty, CommandInput, CommandItem, CommandList} from 'cmdk';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {useVaultContentSearch} from '../hooks/useVaultContentSearch';
import {quickOpenVaultRelativePath} from '../lib/quickOpenNoteFilter';
import {compareVaultSearchNotes} from '../lib/vaultSearchTypes';

/** Max notes rendered as rows; full list is still sorted for ranking before slicing. */
const VAULT_SEARCH_UI_MAX_VISIBLE_NOTES = 100;

export type VaultSearchPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string;
  onPickNote: (uri: string) => void;
};

function bestFieldLabel(field: 'title' | 'path' | 'body'): string {
  switch (field) {
    case 'title':
      return 'Title';
    case 'path':
      return 'Path';
    case 'body':
      return 'Body';
  }
}

export function VaultSearchPalette({
  open,
  onOpenChange,
  vaultRoot,
  onPickNote,
}: VaultSearchPaletteProps) {
  const {
    query,
    setQuery,
    notes,
    progress,
    scanDone,
    awaitingDebouncedRun,
    searchingStatusVisible,
    holdingPreviousResults,
  } = useVaultContentSearch({
    open,
    vaultRoot,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('');
      }
      onOpenChange(next);
    },
    [onOpenChange, setQuery],
  );

  const handlePick = useCallback(
    (uri: string) => {
      onPickNote(uri);
      handleOpenChange(false);
    },
    [handleOpenChange, onPickNote],
  );

  const trimmedQuery = query.trim();
  const sortedNotes = useMemo(
    () => (notes.length <= 1 ? notes : [...notes].sort(compareVaultSearchNotes)),
    [notes],
  );
  const displayedNotes =
    sortedNotes.length <= VAULT_SEARCH_UI_MAX_VISIBLE_NOTES
      ? sortedNotes
      : sortedNotes.slice(0, VAULT_SEARCH_UI_MAX_VISIBLE_NOTES);
  const hiddenNoteCount = sortedNotes.length - displayedNotes.length;

  /** Any change to the ordered note list resets cmdk selection to the first row (stable under object identity). */
  const notesOrderSignature = useMemo(
    () => sortedNotes.map(n => `${n.uri}:${n.score}`).join('\0'),
    [sortedNotes],
  );

  const firstDisplayedItemValue = useMemo(() => {
    if (displayedNotes.length === 0) {
      return '';
    }
    return displayedNotes[0]!.uri;
  }, [displayedNotes]);

  const [commandValue, setCommandValue] = useState(firstDisplayedItemValue);

  useEffect(() => {
    queueMicrotask(() => {
      setCommandValue(firstDisplayedItemValue);
    });
  }, [notesOrderSignature, firstDisplayedItemValue]);

  const indexHint =
    progress != null && !progress.indexReady
      ? ` · index ${progress.indexStatus}`
      : '';

  const skipPart =
    progress != null && progress.skippedLargeFiles > 0
      ? ` · ${progress.skippedLargeFiles} skipped (>512 KiB)`
      : '';
  const progressCounts =
    progress != null ? `${progress.totalHits} notes${indexHint}${skipPart}` : null;

  const statusLine =
    trimmedQuery.length === 0
      ? null
      : !scanDone && searchingStatusVisible
        ? progressCounts != null
          ? `Searching… ${progressCounts}`
          : 'Searching…'
        : awaitingDebouncedRun
          ? progressCounts != null
            ? `Searched ${progressCounts}`
            : null
          : progressCounts != null
            ? `Searched ${progressCounts}`
            : null;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-open-overlay" />
        <Dialog.Content
          className="quick-open-content vault-search-content"
          aria-describedby={undefined}
          onOpenAutoFocus={event => {
            event.preventDefault();
            queueMicrotask(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            });
          }}
        >
          <Dialog.Title className="quick-open-a11y-title">Search in vault</Dialog.Title>
          <Command
            label="Search in vault"
            shouldFilter={false}
            className="quick-open-command"
            loop={false}
            value={commandValue}
            onValueChange={setCommandValue}
            aria-busy={trimmedQuery.length > 0 && !scanDone}
            data-holding-previous-results={holdingPreviousResults ? 'true' : undefined}
          >
            <CommandInput
              ref={inputRef}
              className="quick-open-command__input"
              placeholder="Search note contents…"
              value={query}
              onValueChange={setQuery}
            />
            {statusLine != null ? (
              <div className="vault-search-status">{statusLine}</div>
            ) : null}
            <CommandList className="quick-open-command__list">
              <CommandEmpty className="quick-open-command__empty">
                {trimmedQuery.length === 0
                  ? 'Type to search markdown in the vault.'
                  : scanDone && !awaitingDebouncedRun && notes.length === 0
                    ? progress != null && !progress.indexReady
                      ? 'Index not ready yet — try again in a moment.'
                      : 'No matches.'
                    : null}
              </CommandEmpty>
              {displayedNotes.map((n, i) => {
                const rel = quickOpenVaultRelativePath(vaultRoot, n.uri);
                const preview = n.snippets.slice(0, 3);
                return (
                  <CommandItem
                    key={`${n.uri}:${i}`}
                    value={n.uri}
                    className="quick-open-command__item vault-search-hit"
                    onSelect={() => {
                      handlePick(n.uri);
                    }}
                  >
                    <span className="quick-open-command__item-title">
                      {n.title || rel}{' '}
                      <span className="vault-search-hit__line">
                        {bestFieldLabel(n.bestField)}
                        {n.matchCount > 1 ? ` · ${n.matchCount} matches` : ''}
                      </span>
                    </span>
                    <span className="quick-open-command__item-path vault-search-hit__path-muted">
                      {rel}
                    </span>
                    {preview.length > 0 ? (
                      <span className="quick-open-command__item-path vault-search-hit__snippet-block">
                        {preview.map(s => (
                          <span key={`${s.lineNumber}:${s.text.slice(0, 24)}`} className="vault-search-hit__snippet">
                            {s.lineNumber > 0 ? `L${s.lineNumber}: ` : ''}
                            {s.text}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandList>
            {hiddenNoteCount > 0 ? (
              <div className="vault-search-overflow" role="status">
                Showing {VAULT_SEARCH_UI_MAX_VISIBLE_NOTES} of {sortedNotes.length} notes
              </div>
            ) : null}
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
