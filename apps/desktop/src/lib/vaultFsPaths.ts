/**
 * Path helpers for vault files passed to Tauri/Rust (no Node-only APIs).
 * Vault roots from the folder dialog may use `/` or `\`; we normalize segments then
 * emit `/` separators, which `PathBuf` accepts on Linux and Windows.
 */

function normalizeSeparators(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Directory portion of a file path (POSIX-style result).
 */

export function vaultDirname(filePath: string): string {
  const n = normalizeSeparators(filePath);
  const i = n.lastIndexOf('/');
  if (i <= 0) {
    return n;
  }
  return n.slice(0, i);
}

/**
 * Join a note directory with a relative Markdown `src` (may contain `..`).
 */

export function vaultResolveRelativeToDir(
  noteDirAbsolute: string,
  relativeSrc: string,
): string {
  const dir = normalizeSeparators(noteDirAbsolute);
  const rel = normalizeSeparators(relativeSrc);
  const stack: string[] = [];
  for (const seg of dir.split('/')) {
    if (seg === '' || seg === '.') {
      continue;
    }
    stack.push(seg);
  }
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(seg);
    }
  }
  const joined = stack.join('/');
  if (dir.startsWith('/')) {
    return `/${joined}`;
  }
  return joined;
}

/** Two path segments with a single slash (no `..` resolution). */

export function vaultJoinSimple(a: string, b: string): string {
  const L = normalizeSeparators(a).replace(/\/$/, '');
  const R = normalizeSeparators(b).replace(/^\//, '');
  return `${L}/${R}`;
}
