import type {Text} from '@codemirror/state';

import {wikiLinkInnerAtLineColumn} from './wikiLinkInnerAtLineColumn';

/**
 * Maps a document position (UTF-16 offset) to the raw wiki link inner (`[[inner]]`) on that line,
 * or null if the position is not inside a wiki link span.
 */
export function wikiLinkInnerAtDocPosition(doc: Text, pos: number): string | null {
  const line = doc.lineAt(pos);
  const column = pos - line.from;
  return wikiLinkInnerAtLineColumn(line.text, column);
}
