import type {ReactNode} from 'react';

import {
  INBOX_LEFT_PANEL,
  PODCASTS_LEFT_PANEL,
  VAULT_EPISODES_STACK_TOP,
} from '../lib/layoutStore';

import {DesktopHorizontalSplit} from './DesktopHorizontalSplit';
import {DesktopVerticalSplit} from './DesktopVerticalSplit';

export type MainWorkspaceSplitProps = {
  vaultVisible: boolean;
  episodesVisible: boolean;
  vaultWidthPx: number;
  episodesWidthPx: number;
  onVaultWidthPxChanged: (px: number) => void;
  onEpisodesWidthPxChanged: (px: number) => void;
  /** Height of the Vault pane when Vault and Episodes are both visible (vertical stack). */
  stackTopHeightPx: number;
  onStackTopHeightPxChanged: (px: number) => void;
  vaultPane: ReactNode;
  episodesPane: ReactNode;
  editorPane: ReactNode;
};

/**
 * Optional vault and episodes areas to the left of the editor. When both are visible they stack
 * vertically in one column; otherwise the same fixed-px horizontal splits as before apply.
 */
export function MainWorkspaceSplit({
  vaultVisible,
  episodesVisible,
  vaultWidthPx,
  episodesWidthPx,
  onVaultWidthPxChanged,
  onEpisodesWidthPxChanged,
  stackTopHeightPx,
  onStackTopHeightPxChanged,
  vaultPane,
  episodesPane,
  editorPane,
}: MainWorkspaceSplitProps) {
  if (!vaultVisible && !episodesVisible) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {editorPane}
      </div>
    );
  }

  if (vaultVisible && episodesVisible) {
    return (
      <DesktopHorizontalSplit
        className="split-inner"
        leftWidthPx={vaultWidthPx}
        minLeftPx={INBOX_LEFT_PANEL.minPx}
        maxLeftPx={INBOX_LEFT_PANEL.maxPx}
        minRightPx={220}
        onLeftWidthPxChanged={onVaultWidthPxChanged}
        left={
          <DesktopVerticalSplit
            className="split-inner"
            topHeightPx={stackTopHeightPx}
            minTopPx={VAULT_EPISODES_STACK_TOP.minPx}
            maxTopPx={VAULT_EPISODES_STACK_TOP.maxPx}
            minBottomPx={PODCASTS_LEFT_PANEL.minPx}
            onTopHeightPxChanged={onStackTopHeightPxChanged}
            top={vaultPane}
            bottom={episodesPane}
          />
        }
        right={editorPane}
      />
    );
  }

  if (vaultVisible) {
    return (
      <DesktopHorizontalSplit
        className="split-inner"
        leftWidthPx={vaultWidthPx}
        minLeftPx={INBOX_LEFT_PANEL.minPx}
        maxLeftPx={INBOX_LEFT_PANEL.maxPx}
        minRightPx={220}
        onLeftWidthPxChanged={onVaultWidthPxChanged}
        left={vaultPane}
        right={editorPane}
      />
    );
  }

  return (
    <DesktopHorizontalSplit
      className="split-inner"
      leftWidthPx={episodesWidthPx}
      minLeftPx={PODCASTS_LEFT_PANEL.minPx}
      maxLeftPx={PODCASTS_LEFT_PANEL.maxPx}
      minRightPx={220}
      onLeftWidthPxChanged={onEpisodesWidthPxChanged}
      left={episodesPane}
      right={editorPane}
    />
  );
}
