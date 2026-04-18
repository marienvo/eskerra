let version = 0;
const listeners = new Set<() => void>();

/** Coalesce multiple sync bumps into one microtask so batched parent reconfig reparses static cells once. */
let bumpCoalesceScheduled = false;

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
  if (!bumpCoalesceScheduled) {
    bumpCoalesceScheduled = true;
    queueMicrotask(() => {
      bumpCoalesceScheduled = false;
      version += 1;
      for (const cb of listeners) {
        cb();
      }
    });
  }
}

/** Vitest harness: reset preview version and subscriber set. */
export function __resetForTests(): void {
  version = 0;
  bumpCoalesceScheduled = false;
  listeners.clear();
}
