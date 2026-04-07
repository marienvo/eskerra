import type {DesktopPlayerLabel} from '../hooks/useDesktopPodcastPlayback';

export type AppStatusBarCenter =
  | {kind: 'message'; tone: 'error' | 'info'; text: string}
  | {kind: 'player'; episodeTitle: string; seriesName: string}
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
 * Priority (low → high): tagline, player (paused/playing + episode), simple messages (err, then rename progress, then wiki notice).
 * Simple messages are suppressed while a disk conflict is active (same gating as legacy banners in App).
 */
export function resolveAppStatusBarCenter(
  input: ResolveAppStatusBarCenterInput,
): AppStatusBarCenter {
  const msg = resolveSimpleMessage(input);
  if (msg) {
    return {kind: 'message', ...msg};
  }

  if (
    (input.playerLabel === 'playing' || input.playerLabel === 'paused') &&
    input.activeEpisode
  ) {
    return {
      kind: 'player',
      episodeTitle: input.activeEpisode.title,
      seriesName: input.activeEpisode.seriesName,
    };
  }

  return {kind: 'tagline', text: input.tagline};
}
