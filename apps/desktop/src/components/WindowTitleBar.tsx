import {ListBulletIcon} from '@radix-ui/react-icons';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';

import type {WindowTilingState} from '../lib/windowTiling';
import {
  TodayHubWorkspaceSelect,
  type TodayHubWorkspaceSelectItem,
} from './TodayHubWorkspaceSelect';

const VAULT_RAIL_ICON_DIM = {width: 15, height: 15} as const;

type WindowTitleBarProps = {
  tiling?: WindowTilingState;
  vaultPaneVisible: boolean;
  onToggleVault: () => void;
  /** Mount point for editor open-note tabs (React portal target). */
  onEditorTabsHostRef?: (el: HTMLDivElement | null) => void;
  todayHubSelect?: {
    items: readonly TodayHubWorkspaceSelectItem[];
    activeTodayNoteUri: string | null;
    activeLabel: string;
    onMainActivate: () => void;
    onPickHub: (todayNoteUri: string) => void;
    onOpenHubInNewTab: (todayNoteUri: string) => void;
  } | null;
};

export function WindowTitleBar({
  tiling = 'none',
  vaultPaneVisible,
  onToggleVault,
  onEditorTabsHostRef,
  todayHubSelect = null,
}: WindowTitleBarProps) {
  const tauri = isTauri();

  const onMinimize = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().minimize();
  };

  const onClose = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().close();
  };

  return (
    <header className="window-title-bar" data-window-tiling={tiling}>
      <div
        className="window-title-bar-leading"
        {...(tauri ? {'data-tauri-drag-region': true} : {})}
      >
        <button
          type="button"
          className={[
            'rail-tab',
            'app-tooltip-trigger',
            vaultPaneVisible ? 'active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Vault"
          aria-pressed={vaultPaneVisible}
          data-tooltip="Vault"
          data-tooltip-placement="inline-end"
          onClick={onToggleVault}
        >
          <ListBulletIcon {...VAULT_RAIL_ICON_DIM} aria-hidden />
        </button>
        {todayHubSelect != null && todayHubSelect.items.length > 0 ? (
          <TodayHubWorkspaceSelect
            items={todayHubSelect.items}
            activeTodayNoteUri={todayHubSelect.activeTodayNoteUri}
            activeLabel={todayHubSelect.activeLabel}
            onMainActivate={todayHubSelect.onMainActivate}
            onPickHub={todayHubSelect.onPickHub}
            onOpenHubInNewTab={todayHubSelect.onOpenHubInNewTab}
          />
        ) : null}
      </div>
      <div
        ref={onEditorTabsHostRef}
        className="window-title-editor-tabs-host"
        {...(tauri ? {'data-tauri-drag-region': true} : {})}
      />
      <div
        className="window-title-bar-drag-sliver"
        aria-hidden
        {...(tauri ? {'data-tauri-drag-region': true} : {})}
      />
      <div className="window-title-bar-trailing">
        {tauri ? (
          <div className="window-title-bar-controls" role="group" aria-label="Window">
            <button
              type="button"
              className="window-ctrl app-tooltip-trigger window-ctrl-minimize"
              aria-label="Minimize"
              data-tooltip="Minimize"
              data-tooltip-placement="inline-start"
              onClick={onMinimize}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="3" y="7.5" width="10" height="1.5" rx="0.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="window-ctrl app-tooltip-trigger window-ctrl-close"
              aria-label="Close"
              data-tooltip="Close"
              data-tooltip-placement="inline-start"
              onClick={onClose}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4.35 4.35a.75.75 0 0 1 1.06 0L8 6.94l2.59-2.59a.75.75 0 1 1 1.06 1.06L9.06 8l2.59 2.59a.75.75 0 1 1-1.06 1.06L8 9.06l-2.59 2.59a.75.75 0 0 1-1.06-1.06L6.94 8 4.35 5.41a.75.75 0 0 1 0-1.06Z"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
