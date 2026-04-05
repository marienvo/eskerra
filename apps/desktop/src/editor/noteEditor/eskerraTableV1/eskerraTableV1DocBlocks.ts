import {
  type EskerraTableModelV1,
  parseEskerraTableV1FromLines,
} from '@eskerra/core';
import {type Text} from '@codemirror/state';

export type EskerraTableDocBlock = {
  from: number;
  to: number;
  lineFrom: number;
  model: EskerraTableModelV1;
};

export function looksLikeDelimitedTableLine(text: string): boolean {
  return text.startsWith('|') && text.endsWith('|');
}

/** LF run ending immediately before `pos` (not including char at pos). */
export function countNewlinesBefore(doc: Text, pos: number): number {
  let n = 0;
  for (let i = pos - 1; i >= 0 && doc.sliceString(i, i + 1) === '\n'; i -= 1) {
    n += 1;
  }
  return n;
}

/** LF run starting at `pos` (inclusive). */
export function countNewlinesFrom(doc: Text, pos: number): number {
  let n = 0;
  for (let i = pos; i < doc.length && doc.sliceString(i, i + 1) === '\n'; i += 1) {
    n += 1;
  }
  return n;
}

/**
 * Extra `\n` to insert before the table so there is at least one blank line (two consecutive LF)
 * between prior content and the header, except at start of document.
 */
export function neededNewlinesBeforeTable(doc: Text, tableFrom: number): number {
  if (tableFrom <= 0) {
    return 0;
  }
  const k = countNewlinesBefore(doc, tableFrom);
  return Math.max(0, 2 - k);
}

/**
 * Extra `\n` to append after the last table row (before following document or EOF) so there is
 * at least one blank line after the table.
 */
export function neededNewlinesAfterTable(doc: Text, tableEndExclusive: number): number {
  const m = countNewlinesFrom(doc, tableEndExclusive);
  return Math.max(0, 2 - m);
}

export function buildEskerraTableInsertWithBlankLines(
  doc: Text,
  block: Pick<EskerraTableDocBlock, 'from' | 'to'>,
  tableMarkdown: string,
): string {
  const prefix = '\n'.repeat(neededNewlinesBeforeTable(doc, block.from));
  const suffix = '\n'.repeat(neededNewlinesAfterTable(doc, block.to));
  return prefix + tableMarkdown + suffix;
}

export function findEskerraTableDocBlocks(doc: Text): EskerraTableDocBlock[] {
  const out: EskerraTableDocBlock[] = [];
  let lineNumber = 1;
  while (lineNumber <= doc.lines) {
    const startLine = doc.line(lineNumber);
    if (!looksLikeDelimitedTableLine(startLine.text)) {
      lineNumber += 1;
      continue;
    }

    const lines: string[] = [];
    let endLineNumber = lineNumber;
    while (endLineNumber <= doc.lines) {
      const line = doc.line(endLineNumber);
      if (line.text.trim() === '' || !looksLikeDelimitedTableLine(line.text)) {
        break;
      }
      lines.push(line.text);
      endLineNumber += 1;
    }

    const parsed = parseEskerraTableV1FromLines(lines);
    if (parsed.ok) {
      const endLine = doc.line(endLineNumber - 1);
      out.push({
        from: startLine.from,
        /** Exclude the line break after the last row so commits do not eat the trailing newline. */
        to: endLine.to,
        lineFrom: startLine.from,
        model: parsed.model,
      });
      lineNumber = endLineNumber;
      continue;
    }

    lineNumber = endLineNumber;
  }
  return out;
}

export function findEskerraTableDocBlockByLineFrom(
  doc: Text,
  headerLineFrom: number,
): EskerraTableDocBlock | null {
  return findEskerraTableDocBlocks(doc).find(b => b.lineFrom === headerLineFrom) ?? null;
}
