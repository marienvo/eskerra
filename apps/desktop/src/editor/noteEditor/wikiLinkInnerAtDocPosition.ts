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

/**
 * Wiki link inner for vault navigation (click / Mod-Enter): when `pos` lies in the styled
 * inner span or at the caret slot immediately before `]]` (`innerTo` is the offset of the
 * first `]`). Excludes `[[`, the gap between `]]`, and positions after the link.
 */
export function wikiLinkActivatableInnerAtDocPosition(
  doc: Text,
  pos: number,
): string | null {
  const match = wikiLinkMatchAtDocPosition(doc, pos);
  if (match == null) {
    return null;
  }
  if (pos < match.innerFrom || pos > match.innerTo) {
    return null;
  }
  return match.inner;
}

/**
 * Wiki link inner for **pointer** activation only (`innerFrom` <= pos < `innerTo`), excluding
 * the document offset of the first closing `]`. On non-marker-focus lines `]]` uses
 * `display: none`, so coordinates just past the visible label can map onto that offset; **Mod-Enter**
 * still uses {@link wikiLinkActivatableInnerAtDocPosition} so the caret slot before `]]` keeps working.
 */
export function wikiLinkPointerActivatableInnerAtDocPosition(
  doc: Text,
  pos: number,
): string | null {
  const match = wikiLinkMatchAtDocPosition(doc, pos);
  if (match == null) {
    return null;
  }
  if (pos < match.innerFrom || pos >= match.innerTo) {
    return null;
  }
  return match.inner;
}
