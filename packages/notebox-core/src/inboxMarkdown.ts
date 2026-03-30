import {MARKDOWN_EXTENSION} from './vaultLayout';

export function stemFromMarkdownFileName(fileName: string): string {
  return fileName.endsWith(MARKDOWN_EXTENSION)
    ? fileName.slice(0, -MARKDOWN_EXTENSION.length)
    : fileName;
}

function titleFromNoteName(fileName: string): string {
  const baseName = stemFromMarkdownFileName(fileName);

  return baseName.replace(/[-_]+/g, ' ').trim() || 'Untitled entry';
}

/** Human-readable title from an inbox markdown filename. */

export function getNoteTitle(noteName: string): string {
  return titleFromNoteName(noteName);
}

export function sanitizeFileName(rawName: string): string {
  const normalized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return normalized || `note-${Date.now()}`;
}

export function pickNextInboxMarkdownFileName(
  baseStem: string,
  occupiedMarkdownNames: ReadonlySet<string>,
): string {
  let candidate = `${baseStem}${MARKDOWN_EXTENSION}`;
  let nextSuffix = 2;

  while (occupiedMarkdownNames.has(candidate)) {
    candidate = `${baseStem}-${nextSuffix}${MARKDOWN_EXTENSION}`;
    nextSuffix += 1;
  }

  return candidate;
}

/** Builds the full body for `General/Inbox.md` from Inbox markdown basenames (e.g. `note.md`). */

export function buildInboxMarkdownIndexContent(markdownBasenames: string[]): string {
  const stems = markdownBasenames.map(name => stemFromMarkdownFileName(name)).sort((a, b) => {
    return a.localeCompare(b);
  });
  const lines = ['# Inbox', '', ...stems.map(stem => `- [[Inbox/${stem}|${stem}]]`)];
  return `${lines.join('\n')}\n`;
}
