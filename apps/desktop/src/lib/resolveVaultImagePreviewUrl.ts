import {convertFileSrc} from '@tauri-apps/api/core';

import {ASSETS_DIRECTORY_NAME, ATTACHMENTS_DIRECTORY_NAME} from '@notebox/core';

import {vaultDirname, vaultJoinSimple, vaultResolveRelativeToDir} from './vaultFsPaths';

const INBOX_DIR = 'Inbox';

function inboxNoteBaseDir(
  vaultRoot: string,
  activeNotePath: string | null,
): string {
  const root = vaultRoot.trim();
  if (activeNotePath !== null && activeNotePath.trim() !== '') {
    return vaultDirname(activeNotePath.trim());
  }
  return vaultJoinSimple(root, INBOX_DIR);
}

/**
 * Resolves a Markdown image `src` (relative to an inbox note) to a Webview-safe URL.
 * HTTP(S) and data URLs are returned unchanged.
 */

export function resolveVaultImagePreviewUrl(
  vaultRoot: string,
  activeNotePath: string | null,
  src: string,
): string {
  const trimmed = src.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  const unixRel =
    trimmed.startsWith('../') ||
    trimmed.startsWith(`..\\`) ||
    trimmed.includes(`${ASSETS_DIRECTORY_NAME}/${ATTACHMENTS_DIRECTORY_NAME}`) ||
    trimmed.includes(`${ASSETS_DIRECTORY_NAME}\\${ATTACHMENTS_DIRECTORY_NAME}`);
  if (!unixRel) {
    return trimmed;
  }
  const noteDir = inboxNoteBaseDir(vaultRoot, activeNotePath);
  const absolute = vaultResolveRelativeToDir(noteDir, trimmed);
  return convertFileSrc(absolute);
}
