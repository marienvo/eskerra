import {invoke} from '@tauri-apps/api/core';

import {
  ASSETS_DIRECTORY_NAME,
  ATTACHMENTS_DIRECTORY_NAME,
  buildAttachmentFileName,
  buildInboxRelativeAttachmentMarkdownPath,
  imageMimeToExtension,
  normalizeImageFileExtension,
  normalizeVaultBaseUri,
  sanitizeAttachmentBaseName,
} from '@notebox/core';

import {vaultJoinSimple} from './vaultFsPaths';

export async function vaultWriteFileBytes(
  absolutePath: string,
  contentsBase64: string,
): Promise<void> {
  await invoke('vault_write_file_bytes', {
    path: absolutePath,
    contentsBase64,
  });
}

export async function vaultImportFilesIntoAttachments(
  sources: string[],
): Promise<string[]> {
  if (sources.length === 0) {
    return [];
  }
  return invoke<string[]>('vault_import_files_into_attachments', {sources});
}

/** Encode binary for `vault_write_file_bytes` without blowing the stack on large buffers. */

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function attachmentsDirAbsolute(vaultRoot: string): string {
  const base = normalizeVaultBaseUri(vaultRoot);
  return vaultJoinSimple(
    vaultJoinSimple(base, ASSETS_DIRECTORY_NAME),
    ATTACHMENTS_DIRECTORY_NAME,
  );
}

function uniqueAttachmentToken(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${t}-${r}`;
}

export type SaveBytesOptions = {
  vaultRoot: string;
  bytes: Uint8Array;
  suggestedBaseName: string;
  /** Lowercase extension with a leading dot, for example `.png`. */
  extensionWithDot: string;
};

/**
 * Writes an image into `Assets/Attachments/` and returns the inbox-relative Markdown path
 * (for example `../Assets/Attachments/foo.png`).
 */

export async function saveVaultImageBytes(
  options: SaveBytesOptions,
): Promise<string> {
  const {vaultRoot, bytes, suggestedBaseName, extensionWithDot} = options;
  const stem = sanitizeAttachmentBaseName(suggestedBaseName);
  const token = uniqueAttachmentToken();
  const fileName = buildAttachmentFileName(stem, extensionWithDot, token);
  const dir = attachmentsDirAbsolute(vaultRoot);
  const fullPath = vaultJoinSimple(dir, fileName);
  const b64 = uint8ArrayToBase64(bytes);
  await vaultWriteFileBytes(fullPath, b64);
  return buildInboxRelativeAttachmentMarkdownPath(fileName);
}

export function extensionFromFileNameOrMime(
  fileName: string,
  mimeType: string,
): string | null {
  const fromName = fileName.includes('.')
    ? normalizeImageFileExtension(fileName.slice(fileName.lastIndexOf('.')))
    : null;
  if (fromName) {
    return fromName;
  }
  return imageMimeToExtension(mimeType);
}
