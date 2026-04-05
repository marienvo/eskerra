import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import {editorTabPillDisplayName} from '../lib/editorTabPillDisplayName';

import {MaterialIcon} from './MaterialIcon';

type NoteRow = {lastModified: number | null; name: string; uri: string};

function labelForOpenTab(notes: readonly NoteRow[], uri: string): string {
  const row = notes.find(n => n.uri === uri);
  if (row) {
    return editorTabPillDisplayName(row.name);
  }
  const tail = uri.split(/[/\\]/).pop()?.trim();
  return editorTabPillDisplayName(tail || uri);
}

type EditorOpenTabPillProps = {
  uri: string;
  label: string;
  active: boolean;
  busy: boolean;
  multiTabs: boolean;
  onActivateTab: (uri: string) => void;
  onCloseTab: (uri: string) => void;
  onRenameNote: (uri: string) => void;
  onCloseOtherTabs: (keepUri: string) => void;
};

const EditorOpenTabPill = memo(function EditorOpenTabPill({
  uri,
  label,
  active,
  busy,
  multiTabs,
  onActivateTab,
  onCloseTab,
  onRenameNote,
  onCloseOtherTabs,
}: EditorOpenTabPillProps) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelTruncated, setLabelTruncated] = useState(false);

  const measureLabelTruncation = useCallback(() => {
    const el = labelRef.current;
    if (!el) {
      return;
    }
    setLabelTruncated(el.scrollWidth > el.clientWidth + 0.5);
  }, []);

  useLayoutEffect(() => {
    measureLabelTruncation();
  }, [label, measureLabelTruncation]);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => measureLabelTruncation());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureLabelTruncation]);

  const onCloseClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(uri);
    },
    [onCloseTab, uri],
  );

  const onPillAuxClick = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 1) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(uri);
    },
    [onCloseTab, uri],
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild disabled={busy}>
        <div
          className={
            active
              ? 'editor-open-tab-pill editor-open-tab-pill--active'
              : 'editor-open-tab-pill'
          }
          role="none"
          onAuxClick={onPillAuxClick}
        >
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className={
              labelTruncated
                ? 'editor-open-tab-pill__main app-tooltip-trigger'
                : 'editor-open-tab-pill__main'
            }
            disabled={busy}
            {...(labelTruncated
              ? {
                  'data-tooltip': label,
                  'data-tooltip-placement': 'inline-end' as const,
                }
              : {})}
            onClick={() => onActivateTab(uri)}
          >
            <span className="editor-open-tab-pill__icon" aria-hidden>
              <MaterialIcon name="description" size={12} />
            </span>
            <span ref={labelRef} className="editor-open-tab-pill__label">
              {label}
            </span>
          </button>
          <button
            type="button"
            className="editor-open-tab-pill__close icon-btn-ghost app-tooltip-trigger"
            aria-label={`Close ${label}`}
            data-tooltip="Close tab"
            data-tooltip-placement="inline-end"
            disabled={busy}
            onClick={onCloseClick}
          >
            <MaterialIcon name="close" size={12} />
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="note-list-context-menu"
          alignOffset={4}
          collisionPadding={8}
        >
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={busy}
            onSelect={() => {
              onRenameNote(uri);
            }}
          >
            Rename note
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={busy}
            onSelect={() => {
              onCloseTab(uri);
            }}
          >
            Close tab
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={busy || !multiTabs}
            onSelect={() => {
              onCloseOtherTabs(uri);
            }}
          >
            Close other tabs
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

export type EditorPaneOpenNoteTabsProps = {
  notes: readonly NoteRow[];
  tabUris: readonly string[];
  selectedUri: string | null;
  busy: boolean;
  onActivateTab: (uri: string) => void;
  onCloseTab: (uri: string) => void;
  onRenameNote: (uri: string) => void;
  onCloseOtherTabs: (keepUri: string) => void;
};

export const EditorPaneOpenNoteTabs = memo(function EditorPaneOpenNoteTabs({
  notes,
  tabUris,
  selectedUri,
  busy,
  onActivateTab,
  onCloseTab,
  onRenameNote,
  onCloseOtherTabs,
}: EditorPaneOpenNoteTabsProps) {
  if (tabUris.length === 0) {
    return (
      <span className="pane-title pane-title--truncate editor-open-tabs-placeholder">
        Editor
      </span>
    );
  }

  const multiTabs = tabUris.length > 1;

  return (
    <div className="editor-open-tabs-scroll" role="tablist" aria-label="Open notes">
      {tabUris.map(uri => {
        const active = uri === selectedUri;
        const label = labelForOpenTab(notes, uri);
        return (
          <EditorOpenTabPill
            key={uri}
            uri={uri}
            label={label}
            active={active}
            busy={busy}
            multiTabs={multiTabs}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onRenameNote={onRenameNote}
            onCloseOtherTabs={onCloseOtherTabs}
          />
        );
      })}
    </div>
  );
});
