import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {describe, expect, it} from 'vitest';

import {eskerraTableDocBlocksField} from './eskerraTableDocBlocksField';
import {flushAllEskerraTableDrafts, registerEskerraTableDraftFlusher} from './eskerraTableDraftFlush';

function makeTable(name: string, cols: number): string {
  const headerNames = Array.from({length: cols}, (_, i) => name + i);
  const header = '| ' + headerNames.join(' | ') + ' |';
  const dashes = Array.from({length: cols}, () => '---');
  const sep = '| ' + dashes.join(' | ') + ' |';
  const bodyCells = Array.from({length: cols}, () => 'x');
  const row = '| ' + bodyCells.join(' | ') + ' |';
  return header + '\n' + sep + '\n' + row + '\n';
}

describe('flushAllEskerraTableDrafts', () => {
  it('flushes entries from bottom to top so header line positions stay valid', () => {
    const top = makeTable('A', 2);
    const bottom = makeTable('B', 2);
    const md = `${top}\n${bottom}`;
    const doc = EditorState.create({doc: md}).doc;
    const lineTopFrom = doc.line(1).from;
    let lineBottomFrom = 0;
    for (let i = 1; i <= doc.lines; i += 1) {
      if (doc.line(i).text.includes('B0')) {
        lineBottomFrom = doc.line(i).from;
        break;
      }
    }
    const order: string[] = [];
    const lineTop = {current: lineTopFrom};
    const lineBottom = {current: lineBottomFrom};
    const parent = document.createElement('div');
    const view = new EditorView({
      state: EditorState.create({doc: md, extensions: [eskerraTableDocBlocksField]}),
      parent,
    });
    const unregTop = registerEskerraTableDraftFlusher(lineTop, () => order.push('top'));
    const unregBottom = registerEskerraTableDraftFlusher(lineBottom, () => order.push('bottom'));
    try {
      flushAllEskerraTableDrafts(view);
      expect(order).toEqual(['bottom', 'top']);
    } finally {
      unregTop();
      unregBottom();
      view.destroy();
    }
  });

  it('drops flushers whose table block no longer exists', () => {
    const md = makeTable('Only', 1);
    const goodFrom = EditorState.create({doc: md}).doc.line(1).from;
    const parent = document.createElement('div');
    const view = new EditorView({
      state: EditorState.create({doc: md, extensions: [eskerraTableDocBlocksField]}),
      parent,
    });
    const stale = {current: 99999};
    const good = {current: goodFrom};
    const calls = {n: 0};
    const unregStale = registerEskerraTableDraftFlusher(stale, () => {
      calls.n += 1;
    });
    const unregGood = registerEskerraTableDraftFlusher(good, () => {
      calls.n += 10;
    });
    try {
      flushAllEskerraTableDrafts(view);
      expect(calls.n).toBe(10);
    } finally {
      unregStale();
      unregGood();
      view.destroy();
    }
  });
});
