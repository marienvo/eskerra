/**
 * Display name for editor open-tab pills. Vault inbox notes are markdown; the
 * trailing `.md` is omitted in the pill for a cleaner strip.
 */
export function editorTabPillDisplayName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.md')) {
    return fileName;
  }
  const without = fileName.slice(0, fileName.length - 3);
  return without.length > 0 ? without : fileName;
}
