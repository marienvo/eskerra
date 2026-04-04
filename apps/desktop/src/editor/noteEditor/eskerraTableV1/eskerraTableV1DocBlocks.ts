import {
  type EskerraTableModelV1,
  parseEskerraTableV1FromLines,
} from '@notebox/core';
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

function tableRangeTo(viewDoc: Text, lineTo: number): number {
  if (lineTo < viewDoc.length && viewDoc.sliceString(lineTo, lineTo + 1) === '\n') {
    return lineTo + 1;
  }
  return lineTo;
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
        to: tableRangeTo(doc, endLine.to),
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
