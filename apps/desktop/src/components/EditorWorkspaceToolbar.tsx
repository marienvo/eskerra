import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cross2Icon,
  ListBulletIcon,
} from '@radix-ui/react-icons';

import type {PlaybackTransportProps} from './PlaybackTransport';
import {PlaybackTransport} from './PlaybackTransport';
import {MaterialIcon} from './MaterialIcon';
import {cleanNoteMenuShortcutLabel} from '../lib/desktopShortcutLabels';

const EDITOR_TOOLBAR_ICON_DIM = {width: 15, height: 15} as const;

export type EditorWorkspaceToolbarNowPlaying = {
  episodeTitle: string;
  seriesName: string;
};

export type EditorWorkspaceToolbarProps = {
  vaultPaneVisible: boolean;
  onToggleVault: () => void;
  episodesPaneVisible: boolean;
  onToggleEpisodes: () => void;
  inboxPaneVisible: boolean;
  onToggleInboxPane: () => void;
  busy: boolean;
  editorHistoryCanGoBack: boolean;
  editorHistoryCanGoForward: boolean;
  onEditorHistoryGoBack: () => void;
  onEditorHistoryGoForward: () => void;
  composingNewEntry: boolean;
  editorPaneTitle: string;
  onCancelNewEntry: () => void;
  notificationsPanelVisible: boolean;
  onToggleNotificationsPanel: () => void;
  /** When set and not composing, shown after Back/Forward with spacing, then {@link nowPlaying}. */
  playbackTransport?: PlaybackTransportProps;
  nowPlaying?: EditorWorkspaceToolbarNowPlaying | null;
  /** Markdown layout normalize for the open note; omitted when unavailable (e.g. composing). */
  onCleanNote?: () => void;
};

/**
 * Full-width chrome above the main workspace split (vault / episodes / editor + inbox tree + notifications).
 * Open-note tabs render in the window title bar, not here.
 */
export function EditorWorkspaceToolbar({
  vaultPaneVisible,
  onToggleVault,
  episodesPaneVisible,
  onToggleEpisodes,
  inboxPaneVisible,
  onToggleInboxPane,
  busy,
  editorHistoryCanGoBack,
  editorHistoryCanGoForward,
  onEditorHistoryGoBack,
  onEditorHistoryGoForward,
  composingNewEntry,
  editorPaneTitle,
  onCancelNewEntry,
  notificationsPanelVisible,
  onToggleNotificationsPanel,
  playbackTransport,
  nowPlaying,
  onCleanNote,
}: EditorWorkspaceToolbarProps) {
  const showPlaybackChrome =
    !composingNewEntry && playbackTransport != null && nowPlaying != null;

  return (
    <div
      className={[
        'pane-header pane-header--editor-toolbar editor-workspace-toolbar',
        showPlaybackChrome ? 'editor-workspace-toolbar--playback' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="pane-header-start">
        <button
          type="button"
          className={[
            'pane-header-add-btn icon-btn-ghost app-tooltip-trigger',
            vaultPaneVisible ? 'pane-header-add-btn--vault-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleVault}
          aria-label="Vault"
          aria-pressed={vaultPaneVisible}
          data-tooltip="Vault"
          data-tooltip-placement="inline-end"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <ListBulletIcon {...EDITOR_TOOLBAR_ICON_DIM} />
          </span>
        </button>
        <button
          type="button"
          className={[
            'pane-header-add-btn icon-btn-ghost app-tooltip-trigger',
            episodesPaneVisible ? 'pane-header-add-btn--episodes-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleEpisodes}
          aria-label="Episodes pane"
          aria-pressed={episodesPaneVisible}
          data-tooltip="Episodes"
          data-tooltip-placement="inline-end"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <MaterialIcon name="radio" size={12} />
          </span>
        </button>
        <button
          type="button"
          className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
          onClick={onEditorHistoryGoBack}
          disabled={busy || !editorHistoryCanGoBack}
          aria-label="Back"
          data-tooltip="Back"
          data-tooltip-placement="inline-end"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <ChevronLeftIcon {...EDITOR_TOOLBAR_ICON_DIM} />
          </span>
        </button>
        <button
          type="button"
          className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
          onClick={onEditorHistoryGoForward}
          disabled={busy || !editorHistoryCanGoForward}
          aria-label="Forward"
          data-tooltip="Forward"
          data-tooltip-placement="inline-end"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <ChevronRightIcon {...EDITOR_TOOLBAR_ICON_DIM} />
          </span>
        </button>
        {composingNewEntry ? (
          <span className="pane-title pane-title--truncate" title={editorPaneTitle}>
            {editorPaneTitle}
          </span>
        ) : showPlaybackChrome ? (
          <>
            <span className="editor-workspace-toolbar__playback-gap" aria-hidden />
            <PlaybackTransport {...playbackTransport} variant="toolbar" />
          </>
        ) : null}
      </div>
      {showPlaybackChrome ? (
        <p
          className="editor-workspace-toolbar__now-playing pane-title pane-title--truncate"
          title={`${nowPlaying.episodeTitle} — ${nowPlaying.seriesName}`}
        >
          <strong>{nowPlaying.episodeTitle}</strong>
          <span className="editor-workspace-toolbar__now-playing-series muted">
            {' '}
            — {nowPlaying.seriesName}
          </span>
        </p>
      ) : null}
      <div className="pane-header-trailing-actions">
        {onCleanNote ? (
          <button
            type="button"
            className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
            onClick={onCleanNote}
            disabled={busy}
            aria-label="Clean this note"
            data-tooltip={`Clean this note (${cleanNoteMenuShortcutLabel()})`}
            data-tooltip-placement="inline-start"
          >
            <span className="pane-header-add-btn__glyph" aria-hidden>
              <MaterialIcon name="auto_fix_high" size={12} />
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className={[
            'pane-header-add-btn icon-btn-ghost app-tooltip-trigger',
            inboxPaneVisible ? 'pane-header-add-btn--inbox-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleInboxPane}
          aria-label="Inbox tree pane"
          aria-pressed={inboxPaneVisible}
          data-tooltip="Inbox"
          data-tooltip-placement="inline-start"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <MaterialIcon name="inbox" size={12} />
          </span>
        </button>
        {composingNewEntry ? (
          <button
            type="button"
            className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
            onClick={onCancelNewEntry}
            disabled={busy}
            aria-label="Cancel new entry"
            data-tooltip="Cancel"
            data-tooltip-placement="inline-start"
          >
            <span className="pane-header-add-btn__glyph" aria-hidden>
              <Cross2Icon {...EDITOR_TOOLBAR_ICON_DIM} />
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className={[
            'pane-header-add-btn icon-btn-ghost app-tooltip-trigger',
            notificationsPanelVisible ? 'pane-header-add-btn--notifications-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleNotificationsPanel}
          aria-label="Notifications"
          aria-pressed={notificationsPanelVisible}
          data-tooltip="Notifications"
          data-tooltip-placement="inline-start"
        >
          <span className="pane-header-add-btn__glyph" aria-hidden>
            <BellIcon {...EDITOR_TOOLBAR_ICON_DIM} />
          </span>
        </button>
      </div>
    </div>
  );
}
