import * as Dialog from '@radix-ui/react-dialog';
import {Command, CommandEmpty, CommandInput, CommandItem, CommandList} from 'cmdk';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {useVaultContentSearch} from '../hooks/useVaultContentSearch';
import {quickOpenVaultRelativePath} from '../lib/quickOpenNoteFilter';
import {compareVaultSearchNotes, vaultSearchHighlightSegments} from '@eskerra/core';

/** Max notes rendered as rows; full list is still sorted for ranking before slicing. */
const VAULT_SEARCH_UI_MAX_VISIBLE_NOTES = 100;

export type VaultSearchPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string;
  onPickNote: (uri: string) => void;
};

function VaultSearchHighlighted({
  text,
  queryTrimmed,
}: {
  text: string;
  queryTrimmed: string;
}) {
  const segments = vaultSearchHighlightSegments(text, queryTrimmed);
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark key={i} className="vault-search-hit__query-mark">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
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
  const noteCount =
    progress != null
      ? `${progress.totalHits} note${progress.totalHits === 1 ? '' : 's'}${indexHint}${skipPart}`
      : null;

  const statusLine =
    trimmedQuery.length === 0
      ? null
      : !scanDone && searchingStatusVisible
        ? noteCount != null
          ? `Searching… · ${noteCount}`
          : 'Searching…'
        : awaitingDebouncedRun
          ? noteCount != null
            ? `${noteCount} found`
            : null
          : noteCount != null
            ? `${noteCount} found`
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
                      <VaultSearchHighlighted text={n.title || rel} queryTrimmed={trimmedQuery} />
                      {n.matchCount > 1 ? (
                        <span className="vault-search-hit__line">{` · ${n.matchCount} matches`}</span>
                      ) : null}
                    </span>
                    <span className="quick-open-command__item-path vault-search-hit__path-muted">
                      <VaultSearchHighlighted text={rel} queryTrimmed={trimmedQuery} />
                    </span>
                    {preview.length > 0 ? (
                      <span className="quick-open-command__item-path vault-search-hit__snippet-block">
                        {preview.map(s => (
                          <span
                            key={`${s.lineNumber ?? 'n'}:${s.text.slice(0, 24)}`}
                            className="vault-search-hit__snippet">
                            {s.lineNumber != null && s.lineNumber > 0 ? (
                              <>
                                <span
                                  className="vault-search-hit__snippet-lineno"
                                  title={`Line ${s.lineNumber}`}
                                >
                                  {s.lineNumber}
                                </span>
                                <span className="vault-search-hit__snippet-text">
                                  <VaultSearchHighlighted text={s.text} queryTrimmed={trimmedQuery} />
                                </span>
                              </>
                            ) : (
                              <span className="vault-search-hit__snippet-text">
                                <VaultSearchHighlighted text={s.text} queryTrimmed={trimmedQuery} />
                              </span>
                            )}
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
