import {TODAY_HUB_SECTION_DELIMITER} from './todayHubSectionDelimiter';

/**
 * Paragraph break before the marker (`\n\n` preferred, `\n` allowed), optional spaces on the marker
 * line, then a break after the marker: full blank line, single newline before non-newline content, or
 * end of file. Stricter `\n\n`‑only splits failed on EOF‑after‑marker and some pasted layouts.
 */
const SPLIT_RX =
  /(?:\n\n|\n)\s*::today-section::\s*(?:\n\n|\n(?=[^\n])|$)/g;

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
    return [normalized];
  }
  const chunks = normalized.split(SPLIT_RX);
  if (chunks.length === 1) {
    return [chunks[0], ...Array.from({length: columnCount - 1}, () => '')];
  }
  const head = chunks.slice(0, columnCount - 1);
  const tail = chunks.slice(columnCount - 1).join(TODAY_HUB_SECTION_DELIMITER);
  return [...head, tail];
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
