import {describe, expect, it} from 'vitest';

import {
  countVisualLinesInCell,
  createFixedCharWidthMeasure,
  eskerraCellInnerWidthPx,
  eskerraGridRowHeightPx,
  ESKERRA_RDG_CELL_PADDING_INLINE_PX,
  ESKERRA_TABLE_MIN_ROW_HEIGHT_PX,
  ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX,
  parseComputedLineHeightPx,
  sumEskerraGridRowHeights,
} from './eskerraTableWrappedRowHeight';

describe('parseComputedLineHeightPx', () => {
  it('parses px values with ceil', () => {
    expect(parseComputedLineHeightPx('25.6px', 20)).toBe(26);
  });

  it('returns fallback for normal', () => {
    expect(parseComputedLineHeightPx('normal', 26)).toBe(26);
  });
});

describe('eskerraCellInnerWidthPx', () => {
  it('subtracts horizontal padding for each cell', () => {
    expect(eskerraCellInnerWidthPx(400, 2, 8)).toBeCloseTo(184, 5);
  });

  it('returns 0 when colCount is 0', () => {
    expect(eskerraCellInnerWidthPx(400, 0, 8)).toBe(0);
  });
});

describe('countVisualLinesInCell', () => {
  const m8 = createFixedCharWidthMeasure(8);

  it('counts explicit newlines', () => {
    expect(countVisualLinesInCell('a\nb\nc', 200, m8)).toBe(3);
  });

  it('wraps long single words', () => {
    // inner width 80px, 8px per char => 10 chars per line; 25 chars => 3 lines
    expect(countVisualLinesInCell('0123456789012345678901234', 80, m8)).toBe(3);
  });

  it('wraps multiple words', () => {
    // 10 chars/line: "0123456789" then "01234"
    expect(countVisualLinesInCell('0123456789 01234', 80, m8)).toBe(2);
  });
});

describe('eskerraGridRowHeightPx', () => {
  const measure = createFixedCharWidthMeasure(8);

  it('respects minimum row height', () => {
    const row = {__eskerra_grid_row_id: '0', col_0: 'x'};
    expect(
      eskerraGridRowHeightPx({
        row,
        colCount: 1,
        gridWidthPx: 400,
        measure,
        lineHeightPx: ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX,
        verticalPaddingPx: 8,
        minRowPx: ESKERRA_TABLE_MIN_ROW_HEIGHT_PX,
      }),
    ).toBe(ESKERRA_TABLE_MIN_ROW_HEIGHT_PX);
  });

  it('grows with the tallest wrapped cell in the row', () => {
    const row = {
      __eskerra_grid_row_id: '0',
      col_0: 'short',
      col_1: '0123456789012345678901234',
    };
    // col_1: 25 chars at 8px in ~184px inner (400/2 - 16) => ceil(25/21)? inner=184, 184/8=23 per line => 2 lines? 25/23
    const inner = eskerraCellInnerWidthPx(400, 2, ESKERRA_RDG_CELL_PADDING_INLINE_PX);
    const linesCol1 = countVisualLinesInCell(row.col_1, inner, measure);
    expect(linesCol1).toBe(2);
    expect(
      eskerraGridRowHeightPx({
        row,
        colCount: 2,
        gridWidthPx: 400,
        measure,
      }),
    ).toBe(8 + 2 * ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX);
  });
});

describe('sumEskerraGridRowHeights', () => {
  it('sums per-row heights', () => {
    const rows = [
      {__eskerra_grid_row_id: '0', col_0: 'a'},
      {__eskerra_grid_row_id: '1', col_0: 'b'},
    ];
    expect(
      sumEskerraGridRowHeights({
        rows,
        colCount: 1,
        gridWidthPx: 200,
        measure: createFixedCharWidthMeasure(8),
      }),
    ).toBe(ESKERRA_TABLE_MIN_ROW_HEIGHT_PX * 2);
  });
});
