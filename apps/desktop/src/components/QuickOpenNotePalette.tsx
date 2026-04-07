import type {VaultMarkdownRef} from '@eskerra/core';
import * as Dialog from '@radix-ui/react-dialog';
import {Command, CommandEmpty, CommandInput, CommandItem, CommandList} from 'cmdk';
import {useCallback, useMemo, useRef, useState} from 'react';

import {
  filterVaultNotesForQuickOpen,
  quickOpenVaultRelativePath,
} from '../lib/quickOpenNoteFilter';

export type QuickOpenNotePaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string;
  refs: readonly VaultMarkdownRef[];
  onPickNote: (uri: string) => void;
};

export function QuickOpenNotePalette({
  open,
  onOpenChange,
  vaultRoot,
  refs,
  onPickNote,
}: QuickOpenNotePaletteProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setSearch('');
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const filtered = useMemo(
    () => filterVaultNotesForQuickOpen(search, vaultRoot, refs),
    [refs, search, vaultRoot],
  );

  const handlePick = useCallback(
    (uri: string) => {
      onPickNote(uri);
      handleOpenChange(false);
    },
    [handleOpenChange, onPickNote],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="quick-open-overlay" />
        <Dialog.Content
          className="quick-open-content"
          aria-describedby={undefined}
          onOpenAutoFocus={event => {
            event.preventDefault();
            queueMicrotask(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            });
          }}
        >
          <Dialog.Title className="quick-open-a11y-title">Open note</Dialog.Title>
          <Command
            label="Open note"
            shouldFilter={false}
            className="quick-open-command"
            loop={false}
          >
            <CommandInput
              ref={inputRef}
              className="quick-open-command__input"
              placeholder="Search by name or path…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="quick-open-command__list">
              <CommandEmpty className="quick-open-command__empty">
                No matching notes.
              </CommandEmpty>
              {filtered.map(r => {
                const rel = quickOpenVaultRelativePath(vaultRoot, r.uri);
                return (
                  <CommandItem
                    key={r.uri}
                    value={r.uri}
                    className="quick-open-command__item"
                    onSelect={() => {
                      handlePick(r.uri);
                    }}
                  >
                    <span className="quick-open-command__item-title">{r.name}</span>
                    <span className="quick-open-command__item-path">{rel}</span>
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
