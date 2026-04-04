import {describe, expect, it} from 'vitest';

import {
  columnReorderPermutation,
  deleteBodyRowAt,
  duplicateBodyRowAt,
  duplicateColumnAt,
  insertBodyRowAt,
  insertColumnAt,
  moveBodyRowBefore,
  moveBodyRowStep,
  moveColumnBefore,
  moveColumnStep,
  removeColumnAt,
  sortBodyByColumn,
} from './eskerraTableRowColOps';

function isIdentityPerm(perm: number[]): boolean {
  return perm.every((v, i) => v === i);
}

describe('columnReorderPermutation', () => {
  it('moves first column to end', () => {
    expect(columnReorderPermutation(3, 0, 3)).toEqual([1, 2, 0]);
  });

  it('moves last column to start', () => {
    expect(columnReorderPermutation(3, 2, 0)).toEqual([2, 0, 1]);
  });

  it('no-op when insertBefore equals from', () => {
    const p = columnReorderPermutation(4, 2, 2);
    expect(p).not.toBeNull();
    expect(isIdentityPerm(p!)).toBe(true);
  });

  it('returns null for invalid args', () => {
    expect(columnReorderPermutation(3, -1, 0)).toBeNull();
    expect(columnReorderPermutation(3, 0, 4)).toBeNull();
  });
});

describe('moveColumnBefore', () => {
  it('reorders cells and align together', () => {
    const cells = [
      ['h1', 'h2'],
      ['a', 'b'],
    ];
    const align = ['left', 'right'] as const;
    const out = moveColumnBefore(
      cells,
      [...align],
      0,
      2,
    );
    expect(out).not.toBeNull();
    expect(out!.cells).toEqual([
      ['h2', 'h1'],
      ['b', 'a'],
    ]);
    expect(out!.align).toEqual(['right', 'left']);
  });
});

describe('moveColumnStep', () => {
  it('swaps with left neighbor', () => {
    const cells = [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ];
    const out = moveColumnStep(cells, ['left', 'center', 'right'], 1, -1);
    expect(out!.cells[0]).toEqual(['b', 'a', 'c']);
  });

  it('returns null at edge', () => {
    const cells = [['a'], ['1']];
    expect(moveColumnStep(cells, [undefined], 0, -1)).toBeNull();
  });
});

describe('moveBodyRowBefore', () => {
  it('moves body rows only', () => {
    const cells = [
      ['H'],
      ['r0'],
      ['r1'],
      ['r2'],
    ];
    const out = moveBodyRowBefore(cells, 2, 0);
    expect(out).toEqual([
      ['H'],
      ['r2'],
      ['r0'],
      ['r1'],
    ]);
  });
});

describe('moveBodyRowStep', () => {
  it('moves one step down by swapping with next row', () => {
    const cells = [['H'], ['r0'], ['r1'], ['r2']];
    const out = moveBodyRowStep(cells, 0, 1);
    expect(out).toEqual([['H'], ['r1'], ['r0'], ['r2']]);
  });

  it('moves one step up', () => {
    const cells = [['H'], ['r0'], ['r1']];
    const out = moveBodyRowStep(cells, 1, -1);
    expect(out).toEqual([['H'], ['r1'], ['r0']]);
  });
});

describe('insertColumnAt / removeColumnAt / duplicateColumnAt', () => {
  it('inserts empty column', () => {
    const out = insertColumnAt(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right'],
      1,
    );
    expect(out!.cells).toEqual([
      ['a', '', 'b'],
      ['1', '', '2'],
    ]);
    expect(out!.align).toEqual(['left', undefined, 'right']);
  });

  it('removes column when more than one', () => {
    const out = removeColumnAt(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right'],
      0,
    );
    expect(out!.cells).toEqual([['b'], ['2']]);
    expect(out!.align).toEqual(['right']);
  });

  it('rejects removing sole column', () => {
    expect(removeColumnAt([['a']], [undefined], 0)).toBeNull();
  });

  it('duplicates column to the right', () => {
    const out = duplicateColumnAt(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right'],
      0,
    );
    expect(out!.cells).toEqual([
      ['a', 'a', 'b'],
      ['1', '1', '2'],
    ]);
    expect(out!.align).toEqual(['left', 'left', 'right']);
  });
});

describe('sortBodyByColumn', () => {
  it('sorts only body with en-US locale and stable tie-break', () => {
    const cells = [
      ['H', 'k'],
      ['b', '2'],
      ['a', '1'],
      ['a', '0'],
    ];
    const asc = sortBodyByColumn(cells, 0, 'asc');
    expect(asc!.slice(1)).toEqual([
      ['a', '1'],
      ['a', '0'],
      ['b', '2'],
    ]);
    const desc = sortBodyByColumn(cells, 0, 'desc');
    expect(desc!.slice(1)).toEqual([
      ['b', '2'],
      ['a', '1'],
      ['a', '0'],
    ]);
  });
});

describe('insertBodyRowAt / duplicateBodyRowAt / deleteBodyRowAt', () => {
  it('inserts empty row in body', () => {
    const out = insertBodyRowAt(
      [
        ['H'],
        ['a'],
      ],
      0,
    );
    expect(out).toEqual([['H'], [''], ['a']]);
  });

  it('duplicates row below source', () => {
    const out = duplicateBodyRowAt(
      [
        ['H'],
        ['a', 'b'],
      ],
      0,
    );
    expect(out).toEqual([['H'], ['a', 'b'], ['a', 'b']]);
  });

  it('deletes body row', () => {
    const out = deleteBodyRowAt(
      [
        ['H'],
        ['a'],
        ['b'],
      ],
      0,
    );
    expect(out).toEqual([['H'], ['b']]);
  });
});
