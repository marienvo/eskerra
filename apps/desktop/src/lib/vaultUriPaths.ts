/** Parent directory URI for a vault file path (forward slashes; strips trailing file segment). */
export function vaultUriParentDirectory(fileUri: string): string {
  const norm = fileUri.replace(/\\/g, '/').replace(/\/+$/, '');
  const i = norm.lastIndexOf('/');
  if (i <= 0) {
    return norm;
  }
  return norm.slice(0, i);
}
