import * as Dialog from '@radix-ui/react-dialog';
import {Command, CommandEmpty, CommandInput, CommandItem, CommandList} from 'cmdk';
import {useCallback, useRef} from 'react';

import {useVaultContentSearch} from '../hooks/useVaultContentSearch';
import {quickOpenVaultRelativePath} from '../lib/quickOpenNoteFilter';

export type VaultSearchPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string;
  onPickNote: (uri: string) => void;
};

export function VaultSearchPalette({
  open,
  onOpenChange,
  vaultRoot,
  onPickNote,
}: VaultSearchPaletteProps) {
  const {query, setQuery, hits, progress, scanDone} = useVaultContentSearch({
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

  const statusLine =
    progress != null
      ? `Scanning… ${progress.scannedFiles} files · ${progress.totalHits} hits · ${progress.skippedLargeFiles} skipped (>512 KiB)`
      : scanDone
        ? null
        : 'Scanning…';

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
          >
            <CommandInput
              ref={inputRef}
              className="quick-open-command__input"
              placeholder="Search note contents…"
              value={query}
              onValueChange={setQuery}
            />
            {statusLine != null && query.trim().length > 0 ? (
              <div className="vault-search-status">{statusLine}</div>
            ) : null}
            <CommandList className="quick-open-command__list">
              <CommandEmpty className="quick-open-command__empty">
                {query.trim().length === 0
                  ? 'Type to search markdown in the vault.'
                  : !scanDone && hits.length === 0
                    ? 'Scanning…'
                    : scanDone && hits.length === 0
                      ? 'No matches.'
                      : '\u00a0'}
              </CommandEmpty>
              {hits.map((h, i) => {
                const rel = quickOpenVaultRelativePath(vaultRoot, h.uri);
                return (
                  <CommandItem
                    key={`${h.uri}:${h.lineNumber}:${i}`}
                    value={`${h.uri}:${h.lineNumber}`}
                    className="quick-open-command__item vault-search-hit"
                    onSelect={() => {
                      handlePick(h.uri);
                    }}
                  >
                    <span className="quick-open-command__item-title">
                      {rel} <span className="vault-search-hit__line">L{h.lineNumber}</span>
                    </span>
                    <span className="quick-open-command__item-path vault-search-hit__snippet">
                      {h.snippet}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
