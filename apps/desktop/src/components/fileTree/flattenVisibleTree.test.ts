import {describe, expect, it} from 'vitest';

import {fileTreeExampleData} from './fileTreeExampleData';
import {buildTreeParentMap, flattenVisibleTree} from './flattenVisibleTree';

describe('flattenVisibleTree', () => {
  it('returns only roots when nothing is expanded except implicit walk', () => {
    const rows = flattenVisibleTree(fileTreeExampleData, new Set());
    expect(rows.map(r => r.id)).toEqual(['root']);
  });

  it('walks expanded branches depth-first', () => {
    const expanded = new Set(['root', 'inbox']);
    const rows = flattenVisibleTree(fileTreeExampleData, expanded);
    expect(rows.map(r => r.id)).toEqual([
      'root',
      'today-hub',
      'inbox',
      'note-a',
      'note-b',
      'readme',
    ]);
    expect(rows.find(r => r.id === 'inbox')?.depth).toBe(1);
    expect(rows.find(r => r.id === 'note-a')?.depth).toBe(2);
  });

  it('reports hasChildren for folders', () => {
    const rows = flattenVisibleTree(fileTreeExampleData, new Set(['root']));
    const inbox = rows.find(r => r.id === 'inbox');
    expect(inbox?.hasChildren).toBe(true);
    const readme = rows.find(r => r.id === 'readme');
    expect(readme?.hasChildren).toBe(false);
  });
});

describe('buildTreeParentMap', () => {
  it('maps ids to parent chain', () => {
    const map = buildTreeParentMap(fileTreeExampleData);
    expect(map.get('root')).toBe(null);
    expect(map.get('note-a')).toBe('inbox');
    expect(map.get('inbox')).toBe('root');
  });
});
