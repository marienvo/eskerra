/** Parent directory URI for a vault file path (forward slashes; strips trailing file segment). */
export function vaultUriParentDirectory(fileUri: string): string {
  let norm = fileUri.replace(/\\/g, '/');
  while (norm.endsWith('/')) {
    norm = norm.slice(0, -1);
  }
  const i = norm.lastIndexOf('/');
  if (i <= 0) {
    return norm;
  }
  return norm.slice(0, i);
}
