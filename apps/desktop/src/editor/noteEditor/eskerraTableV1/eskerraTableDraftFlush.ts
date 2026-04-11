import {type EditorView} from '@codemirror/view';

import {eskerraTableDocBlockAtHeaderLine} from './eskerraTableDocBlocksField';

type FlushEntry = {
  /** Tracks the header line `from` position; updated by the grid each render. */
  lineFromRef: {current: number};
  flush: () => void;
};

const flushEntries: FlushEntry[] = [];

/**
 * Registers a synchronous flush that writes the grid draft into the document when needed.
 * `lineFromRef` must stay aligned with the table header line position in the document.
 */
export function registerEskerraTableDraftFlusher(
  lineFromRef: {current: number},
  flush: () => void,
): () => void {
  const entry: FlushEntry = {lineFromRef, flush};
  flushEntries.push(entry);
  return () => {
    const i = flushEntries.indexOf(entry);
    if (i >= 0) {
      flushEntries.splice(i, 1);
    }
  };
}

/**
 * Run every registered draft flusher once. Commits bottom-of-document tables first so byte
 * offsets for tables above stay valid, and re-resolves positions after each commit.
 */
export function flushAllEskerraTableDrafts(view: EditorView): void {
  const remaining = new Set(flushEntries);
  while (remaining.size > 0) {
    let best: {sortFrom: number; entry: FlushEntry} | null = null;
    for (const entry of remaining) {
      const block = eskerraTableDocBlockAtHeaderLine(
        view.state,
        entry.lineFromRef.current,
      );
      if (!block) {
        remaining.delete(entry);
        continue;
      }
      if (!best || block.from > best.sortFrom) {
        best = {sortFrom: block.from, entry};
      }
    }
    if (!best) {
      break;
    }
    best.entry.flush();
    remaining.delete(best.entry);
  }
}
