import {
  enumerateTodayHubWeekStarts,
  todayHubRowUriFromTodayNoteUri,
} from '@eskerra/core';

import {loadPersistedActiveTodayHubUri} from '../../features/vault/storage/activeTodayHubStorage';

function vaultUriBelongsToBase(hubUri: string, baseUri: string): boolean {
  const h = hubUri.replace(/\\/g, '/').trim();
  const b = baseUri.replace(/\\/g, '/').replace(/\/+$/, '');
  return h.startsWith(`${b}/`) || h === b;
}

/**
 * URIs to prefetch during native `prepareEskerraSession` (Today intro + current week row).
 * Uses persisted hub when it belongs to this vault; week start uses default Monday (same as
 * empty frontmatter) so prefetch stays valid before settings are parsed.
 */
export async function resolveTodayHubPrefetchUrisForSession(
  baseUri: string,
): Promise<string[] | undefined> {
  const hub = await loadPersistedActiveTodayHubUri();
  if (!hub || !vaultUriBelongsToBase(hub, baseUri)) {
    return undefined;
  }
  const weekStarts = enumerateTodayHubWeekStarts(new Date(), 'monday');
  const ws = weekStarts[0];
  if (!ws) {
    return [hub];
  }
  return [hub, todayHubRowUriFromTodayNoteUri(hub, ws)];
}
