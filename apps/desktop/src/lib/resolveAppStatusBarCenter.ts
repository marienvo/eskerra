import type {DesktopPlayerLabel} from '../hooks/useDesktopPodcastPlayback';

export type AppStatusBarCenter =
  | {kind: 'message'; tone: 'error' | 'info'; text: string}
  | {kind: 'tagline'; text: string};

export type ResolveAppStatusBarCenterInput = {
  err: string | null;
  diskConflict: boolean;
  diskConflictSoft: boolean;
  renameLinkProgress: {done: number; total: number} | null;
  wikiRenameNotice: string | null;
  playerLabel: DesktopPlayerLabel;
  activeEpisode: {seriesName: string; title: string} | null;
  tagline: string;
};

function resolveSimpleMessage(
  input: Pick<
    ResolveAppStatusBarCenterInput,
    | 'err'
    | 'diskConflict'
    | 'diskConflictSoft'
    | 'renameLinkProgress'
    | 'wikiRenameNotice'
  >,
): {tone: 'error' | 'info'; text: string} | null {
  if (input.err) {
    return {tone: 'error', text: input.err};
  }
  if (input.diskConflict || input.diskConflictSoft) {
    return null;
  }
  if (input.renameLinkProgress) {
    const {done, total} = input.renameLinkProgress;
    return {
      tone: 'info',
      text: `Updating links… ${done}/${total}`,
    };
  }
  if (input.wikiRenameNotice) {
    return {tone: 'info', text: input.wikiRenameNotice};
  }
  return null;
}

/**
 * Resolves the status bar center line. Priority (high wins): simple messages (err, then rename
 * progress, then wiki notice), else tagline. Episode title and playback live on
 * {@link EditorWorkspaceToolbar}; this row stays tagline when nothing else applies. Simple messages
 * are suppressed while a disk conflict is active (same gating as legacy banners in App), except
 * **err** still wins.
 */
export function resolveAppStatusBarCenter(
  input: ResolveAppStatusBarCenterInput,
): AppStatusBarCenter {
  const msg = resolveSimpleMessage(input);
  if (msg) {
    return {kind: 'message', ...msg};
  }

  return {kind: 'tagline', text: input.tagline};
}
