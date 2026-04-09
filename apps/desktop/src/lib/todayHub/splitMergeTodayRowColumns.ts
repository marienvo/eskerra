import {TODAY_HUB_SECTION_DELIMITER} from './todayHubSectionDelimiter';

/**
 * Paragraph break before the marker (`\n\n` preferred, `\n` allowed), optional horizontal spaces on
 * the marker line (`[ \t]*` only — not `\s*`), then a break after the marker: full blank line, single
 * newline before non-newline content, or end of file.
 *
 * **Do not** use `\s*` around `::today-section::`: it matches newlines, so with an empty middle
 * column the post-marker `\n\n` plus the next delimiter's leading `\n\n` can be eaten in one match,
 * collapsing column slots (3 cols → 2 chunks).
 */
const SPLIT_RX =
  /(?:\n\n|\n)[ \t]*::today-section::[ \t]*(?:\n\n|\n(?=[^\n])|$)/g;

/** A line that is only the section marker (optional spaces) — never valid user prose in a cell. */
const SECTION_MARKER_ONLY_LINE = /^\s*::today-section::\s*$/;

/**
 * Removes stray `::today-section::` lines from a column body. Malformed row text (adjacent markers,
 * marker at chunk start without a leading newline before it, etc.) can leave markers inside a segment;
 * those must not show in the hub cell editor.
 */
export function stripTodayHubDelimiterOnlyLinesFromColumn(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n');
  return normalized
    .split('\n')
    .filter(line => !SECTION_MARKER_ONLY_LINE.test(line))
    .join('\n');
}

function sanitizeColumnChunks(chunks: string[]): string[] {
  return chunks.map(stripTodayHubDelimiterOnlyLinesFromColumn);
}

/**
 * Splits row file body into `columnCount` segments. Single column: whole text.
 * If `columnCount > 1` but no delimiter: segment 0 holds entire text, rest empty.
 * Extra delimited chunks are merged into the last column.
 * Delimiter matching is slightly relaxed vs the canonical `TODAY_HUB_SECTION_DELIMITER` (see `SPLIT_RX`).
 */
export function splitTodayRowIntoColumns(fullText: string, columnCount: number): string[] {
  if (columnCount < 1) {
    throw new Error('columnCount must be at least 1');
  }
  const normalized = fullText.replace(/\r\n/g, '\n');
  if (columnCount === 1) {
    return sanitizeColumnChunks([normalized]);
  }
  const chunks = normalized.split(SPLIT_RX);
  if (chunks.length === 1) {
    return sanitizeColumnChunks([chunks[0], ...Array.from({length: columnCount - 1}, () => '')]);
  }
  const head = chunks.slice(0, columnCount - 1);
  const tail = chunks.slice(columnCount - 1).join(TODAY_HUB_SECTION_DELIMITER);
  return sanitizeColumnChunks([...head, tail]);
}

export function mergeTodayRowColumns(sections: string[]): string {
  if (sections.length === 0) {
    return '';
  }
  if (sections.length === 1) {
    return sections[0];
  }
  return sections.join(TODAY_HUB_SECTION_DELIMITER);
}

/** True if every section is empty or whitespace-only. */
export function todayHubRowSectionsAllBlank(sections: string[]): boolean {
  return sections.every(s => s.trim() === '');
}
