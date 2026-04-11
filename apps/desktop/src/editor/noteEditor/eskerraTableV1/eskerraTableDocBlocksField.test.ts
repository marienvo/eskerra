import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {
  eskerraTableDocBlockAtHeaderLine,
  eskerraTableDocBlocksField,
} from './eskerraTableDocBlocksField';

function makeTable(name: string, cols: number): string {
  const header = `| ${Array.from({length: cols}, (_, i) => `${name}${i}`).join(' | ')} |`;
  const sep = `| ${Array.from({length: cols}, () => '---').join(' | ')} |`;
  const row = `| ${Array.from({length: cols}, () => 'x').join(' | ')} |`;
  return `${header}\n${sep}\n${row}\n`;
}

describe('eskerraTableDocBlockAtHeaderLine', () => {
  it('finds block by header line from without rescanning', () => {
    const md = makeTable('T', 2);
    const state = EditorState.create({doc: md, extensions: [eskerraTableDocBlocksField]});
    const headerFrom = state.doc.line(1).from;
    const block = eskerraTableDocBlockAtHeaderLine(state, headerFrom);
    expect(block).not.toBeNull();
    expect(block!.lineFrom).toBe(headerFrom);
  });
});
