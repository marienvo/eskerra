import type {EskerraTableAlignment} from '@notebox/core';

/** Build permuted column indices: move `from` so it lands before `insertBefore` (0..n). */
export function columnReorderPermutation(
  n: number,
  from: number,
  insertBefore: number,
): number[] | null {
  if (n < 1 || from < 0 || from >= n || insertBefore < 0 || insertBefore > n) {
    return null;
  }
  const perm = Array.from({length: n}, (_, i) => i);
  const [removed] = perm.splice(from, 1);
  if (removed === undefined) {
    return null;
  }
  let ins = insertBefore;
  if (from < insertBefore) {
    ins -= 1;
  }
  perm.splice(ins, 0, removed);
  return perm;
}

export function applyColumnPermutation(
  cells: string[][],
  align: EskerraTableAlignment[],
  perm: number[],
): {cells: string[][]; align: EskerraTableAlignment[]} {
  const nextCells = cells.map(row => perm.map(j => row[j] ?? ''));
  const nextAlign = perm.map(j => align[j]);
  return {cells: nextCells, align: nextAlign};
}

export function moveColumnBefore(
  cells: string[][],
  align: EskerraTableAlignment[],
  from: number,
  insertBefore: number,
): {cells: string[][]; align: EskerraTableAlignment[]} | null {
  const n = cells[0]?.length ?? 0;
  if (n === 0) {
    return null;
  }
  const perm = columnReorderPermutation(n, from, insertBefore);
  if (!perm) {
    return null;
  }
  return applyColumnPermutation(cells, align, perm);
}

/** Body-only row index permutation: `from` / `insertBefore` in 0..bodyLen (insertBefore may be bodyLen). */
export function bodyRowReorderPermutation(
  bodyLen: number,
  from: number,
  insertBefore: number,
): number[] | null {
  return columnReorderPermutation(bodyLen, from, insertBefore);
}

export function moveBodyRowBefore(
  cells: string[][],
  fromBodyIndex: number,
  insertBeforeBody: number,
): string[][] | null {
  if (cells.length < 2) {
    return null;
  }
  const header = cells[0]!;
  const body = cells.slice(1);
  const m = body.length;
  const perm = bodyRowReorderPermutation(m, fromBodyIndex, insertBeforeBody);
  if (!perm) {
    return null;
  }
  const nextBody = perm.map(i => [...(body[i] ?? [])]);
  return [header, ...nextBody];
}

export function insertColumnAt(
  cells: string[][],
  align: EskerraTableAlignment[],
  insertAt: number,
): {cells: string[][]; align: EskerraTableAlignment[]} | null {
  const n = cells[0]?.length ?? 0;
  const nRows = cells.length;
  if (n === 0 || nRows === 0 || insertAt < 0 || insertAt > n) {
    return null;
  }
  const nextAlign: EskerraTableAlignment[] = [
    ...align.slice(0, insertAt),
    undefined,
    ...align.slice(insertAt),
  ];
  const nextCells = cells.map(row => [
    ...row.slice(0, insertAt),
    '',
    ...row.slice(insertAt),
  ]);
  return {cells: nextCells, align: nextAlign};
}

export function removeColumnAt(
  cells: string[][],
  align: EskerraTableAlignment[],
  col: number,
): {cells: string[][]; align: EskerraTableAlignment[]} | null {
  const n = cells[0]?.length ?? 0;
  if (n <= 1 || col < 0 || col >= n) {
    return null;
  }
  const nextAlign = align.filter((_, i) => i !== col);
  const nextCells = cells.map(row => row.filter((_, i) => i !== col));
  return {cells: nextCells, align: nextAlign};
}

export function duplicateColumnAt(
  cells: string[][],
  align: EskerraTableAlignment[],
  col: number,
): {cells: string[][]; align: EskerraTableAlignment[]} | null {
  const n = cells[0]?.length ?? 0;
  if (n === 0 || col < 0 || col >= n) {
    return null;
  }
  const a = align[col];
  const nextAlign: EskerraTableAlignment[] = [
    ...align.slice(0, col + 1),
    a,
    ...align.slice(col + 1),
  ];
  const nextCells = cells.map(row => {
    const v = row[col] ?? '';
    return [...row.slice(0, col + 1), v, ...row.slice(col + 1)];
  });
  return {cells: nextCells, align: nextAlign};
}

export function setColumnAlignment(
  align: EskerraTableAlignment[],
  col: number,
  value: EskerraTableAlignment,
): EskerraTableAlignment[] | null {
  if (col < 0 || col >= align.length) {
    return null;
  }
  const next = [...align];
  next[col] = value;
  return next;
}

export function sortBodyByColumn(
  cells: string[][],
  col: number,
  direction: 'asc' | 'desc',
): string[][] | null {
  const n = cells[0]?.length ?? 0;
  if (cells.length < 2 || col < 0 || col >= n) {
    return null;
  }
  const header = cells[0]!;
  const body = cells.slice(1);
  const mul = direction === 'asc' ? 1 : -1;
  const indexed = body.map((row, i) => ({row, i}));
  indexed.sort((a, b) => {
    const ta = (a.row[col] ?? '').trim();
    const tb = (b.row[col] ?? '').trim();
    const c = ta.localeCompare(tb, 'en-US', {sensitivity: 'base'});
    if (c !== 0) {
      return mul * c;
    }
    return a.i - b.i;
  });
  return [header, ...indexed.map(x => x.row)];
}

export function insertBodyRowAt(
  cells: string[][],
  bodyInsertBefore: number,
): string[][] | null {
  const n = cells[0]?.length ?? 0;
  const bodyLen = cells.length - 1;
  if (n === 0 || bodyInsertBefore < 0 || bodyInsertBefore > bodyLen) {
    return null;
  }
  const empty = Array.from({length: n}, () => '');
  const header = cells[0]!;
  const body = cells.slice(1);
  const nextBody = [
    ...body.slice(0, bodyInsertBefore),
    empty,
    ...body.slice(bodyInsertBefore),
  ];
  return [header, ...nextBody];
}

export function duplicateBodyRowAt(
  cells: string[][],
  bodyIndex: number,
): string[][] | null {
  const n = cells[0]?.length ?? 0;
  const bodyLen = cells.length - 1;
  if (n === 0 || bodyIndex < 0 || bodyIndex >= bodyLen) {
    return null;
  }
  const header = cells[0]!;
  const body = cells.slice(1);
  const copy = [...(body[bodyIndex] ?? [])];
  const nextBody = [
    ...body.slice(0, bodyIndex + 1),
    copy,
    ...body.slice(bodyIndex + 1),
  ];
  return [header, ...nextBody];
}

export function deleteBodyRowAt(cells: string[][], bodyIndex: number): string[][] | null {
  const bodyLen = cells.length - 1;
  if (bodyIndex < 0 || bodyIndex >= bodyLen) {
    return null;
  }
  const header = cells[0]!;
  const body = cells.slice(1);
  const nextBody = body.filter((_, i) => i !== bodyIndex);
  return [header, ...nextBody];
}

export function moveBodyRowStep(
  cells: string[][],
  bodyIndex: number,
  delta: -1 | 1,
): string[][] | null {
  if (delta === -1) {
    return moveBodyRowBefore(cells, bodyIndex, bodyIndex - 1);
  }
  return moveBodyRowBefore(cells, bodyIndex, bodyIndex + 2);
}

export function moveColumnStep(
  cells: string[][],
  align: EskerraTableAlignment[],
  col: number,
  delta: -1 | 1,
): {cells: string[][]; align: EskerraTableAlignment[]} | null {
  const n = cells[0]?.length ?? 0;
  if (n === 0) {
    return null;
  }
  if (delta === -1) {
    if (col <= 0) {
      return null;
    }
    return moveColumnBefore(cells, align, col, col - 1);
  }
  if (col >= n - 1) {
    return null;
  }
  return moveColumnBefore(cells, align, col, col + 2);
}
