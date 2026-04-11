import * as ContextMenu from '@radix-ui/react-context-menu';
import {isTauri} from '@tauri-apps/api/core';
import {Cross2Icon, DashboardIcon, ReaderIcon} from '@radix-ui/react-icons';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import {
  editorOpenTabPillIconName,
  editorOpenTabPillLabel,
  type EditorOpenTabPillIconName,
} from '../lib/editorOpenTabPillLabel';
import {tabCurrentUri, type EditorWorkspaceTab} from '../lib/editorWorkspaceTabs';

import {FILE_TREE_ICON_SIZE_PX} from './fileTree/fileTreeConstants';

const TAB_PILL_ICON_DIM = {
  width: FILE_TREE_ICON_SIZE_PX,
  height: FILE_TREE_ICON_SIZE_PX,
} as const;

function TitleBarTabStripDragFiller() {
  const tauri = isTauri();
  return (
    <div
      className="editor-open-tabs-titlebar-drag-filler"
      aria-hidden
      {...(tauri ? {'data-tauri-drag-region': true} : {})}
    />
  );
}

function EditorOpenTabPillLeadingIcon({iconName}: {iconName: EditorOpenTabPillIconName}) {
  return iconName === 'today' ? (
    <DashboardIcon {...TAB_PILL_ICON_DIM} aria-hidden />
  ) : (
    <ReaderIcon {...TAB_PILL_ICON_DIM} aria-hidden />
  );
}

type NoteRow = {lastModified: number | null; name: string; uri: string};

type EditorOpenTabPillProps = {
  tabId: string;
  uri: string | null;
  label: string;
  iconName: EditorOpenTabPillIconName;
  active: boolean;
  busy: boolean;
  multiTabs: boolean;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameNote: (uri: string) => void;
  onCloseOtherTabs: (keepTabId: string) => void;
};

const EditorOpenTabPill = memo(function EditorOpenTabPill({
  tabId,
  uri,
  label,
  iconName,
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
      onCloseTab(tabId);
    },
    [onCloseTab, tabId],
  );

  const onPillAuxClick = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 1) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab, tabId],
  );

  const onPillMiddleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 1) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [],
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
          onMouseDown={onPillMiddleMouseDown}
        >
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className={[
              'editor-open-tab-pill__main',
              labelTruncated ? 'app-tooltip-trigger' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy}
            {...(labelTruncated
              ? {
                  'data-tooltip': label,
                  'data-tooltip-placement': 'inline-end' as const,
                }
              : {})}
            onClick={() => {
              onActivateTab(tabId);
            }}
          >
            <span className="editor-open-tab-pill__icon" aria-hidden>
              <EditorOpenTabPillLeadingIcon iconName={iconName} />
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
            <Cross2Icon {...TAB_PILL_ICON_DIM} aria-hidden />
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
            disabled={busy || uri == null}
            onSelect={() => {
              if (uri) {
                onRenameNote(uri);
              }
            }}
          >
            Rename note
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={busy}
            onSelect={() => {
              onCloseTab(tabId);
            }}
          >
            Close tab
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={busy || !multiTabs || uri == null}
            onSelect={() => {
              onCloseOtherTabs(tabId);
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
  workspaceTabs: readonly EditorWorkspaceTab[];
  activeTabId: string | null;
  busy: boolean;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameNote: (uri: string) => void;
  onCloseOtherTabs: (keepTabId: string) => void;
  /** When true, tab strip uses title bar layout (single row, flex shrink, clip). */
  inTitleBar?: boolean;
};

export const EditorPaneOpenNoteTabs = memo(function EditorPaneOpenNoteTabs({
  notes,
  workspaceTabs,
  activeTabId,
  busy,
  onActivateTab,
  onCloseTab,
  onRenameNote,
  onCloseOtherTabs,
  inTitleBar = false,
}: EditorPaneOpenNoteTabsProps) {
  if (workspaceTabs.length === 0) {
    if (inTitleBar) {
      return (
        <div className="editor-open-tabs-scroll editor-open-tabs-scroll--titlebar editor-open-tabs-scroll--titlebar-empty">
          <span className="editor-open-tabs-placeholder editor-open-tabs-placeholder--titlebar">
            Editor
          </span>
          <TitleBarTabStripDragFiller />
        </div>
      );
    }
    return (
      <span className="pane-title pane-title--truncate editor-open-tabs-placeholder">
        Editor
      </span>
    );
  }

  const multiTabs = workspaceTabs.length > 1;

  const scrollClass = inTitleBar
    ? 'editor-open-tabs-scroll editor-open-tabs-scroll--titlebar'
    : 'editor-open-tabs-scroll';

  return (
    <div className={scrollClass} role="tablist" aria-label="Open notes">
      {workspaceTabs.map(tab => {
        const uri = tabCurrentUri(tab);
        const active = tab.id === activeTabId;
        const label = uri
          ? editorOpenTabPillLabel(notes, uri)
          : 'Editor';
        const iconName = uri ? editorOpenTabPillIconName(uri) : 'description';
        return (
          <EditorOpenTabPill
            key={tab.id}
            tabId={tab.id}
            uri={uri}
            label={label}
            iconName={iconName}
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
      {inTitleBar ? <TitleBarTabStripDragFiller /> : null}
    </div>
  );
});
