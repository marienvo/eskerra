let version = 0;
const listeners = new Set<() => void>();

export function subscribeTableShellStaticPreview(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getTableShellStaticPreviewVersion(): number {
  return version;
}

/** Bumped when nested table cell editors receive wiki / relative link highlight reconfiguration. */
export function bumpTableShellStaticPreview(): void {
  version += 1;
  for (const cb of listeners) {
    cb();
  }
}
