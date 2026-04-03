import type {Text} from '@codemirror/state';

import {
  wikiLinkInnerAtLineColumn,
  wikiLinkMatchAtLineColumn,
  type WikiLinkLineMatch,
} from './wikiLinkInnerAtLineColumn';

export type WikiLinkDocMatch = WikiLinkLineMatch & {
  innerFrom: number;
  innerTo: number;
};

/**
 * Maps a document position (UTF-16 offset) to the raw wiki link inner (`[[inner]]`) on that line,
 * or null if the position is not inside a wiki link span.
 */
export function wikiLinkInnerAtDocPosition(doc: Text, pos: number): string | null {
  const line = doc.lineAt(pos);
  const column = pos - line.from;
  return wikiLinkInnerAtLineColumn(line.text, column);
}

export function wikiLinkMatchAtDocPosition(
  doc: Text,
  pos: number,
): WikiLinkDocMatch | null {
  const line = doc.lineAt(pos);
  const column = pos - line.from;
  const match = wikiLinkMatchAtLineColumn(line.text, column);
  if (!match) {
    return null;
  }
  return {
    ...match,
    innerFrom: line.from + match.innerFrom,
    innerTo: line.from + match.innerTo,
  };
}
