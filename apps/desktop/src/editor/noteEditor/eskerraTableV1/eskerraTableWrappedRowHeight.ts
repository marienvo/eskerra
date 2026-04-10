/** Matches react-data-grid default cell `padding-inline` for width math. */
export const ESKERRA_RDG_CELL_PADDING_INLINE_PX = 8;

export const ESKERRA_TABLE_MIN_ROW_HEIGHT_PX = 34;

/** Capture editor `.cm-scroller` uses `--nb-editor-font-size` / `--nb-editor-line-height` (see App.css). */
export const ESKERRA_TABLE_CAPTURE_FONT_SIZE_PX = 15;
export const ESKERRA_TABLE_CAPTURE_LINE_HEIGHT_RATIO = 1.55;

/**
 * Line box height for row sizing: must match wrapped cell text, not a smaller guess
 * (else `overflow: hidden` on `.rdg-cell` clips descenders).
 */
export const ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX = Math.ceil(
  ESKERRA_TABLE_CAPTURE_FONT_SIZE_PX * ESKERRA_TABLE_CAPTURE_LINE_HEIGHT_RATIO,
);

/** Sum of vertical padding inside the cell (matches App.css `padding-block` on `.rdg-cell`). */
export const ESKERRA_TABLE_CELL_VERTICAL_PADDING_PX = 8;

/** Use computed `line-height` from the grid wrap when it resolves to px (else `fallbackPx`). */
export function parseComputedLineHeightPx(
  computedLineHeight: string,
  fallbackPx: number,
): number {
  if (computedLineHeight === 'normal') {
    return fallbackPx;
  }
  const n = parseFloat(computedLineHeight);
  if (!Number.isFinite(n)) {
    return fallbackPx;
  }
  return Math.max(1, Math.ceil(n));
}

export type EskerraTextWidthMeasure = (text: string) => number;

/** Deterministic measure for unit tests: each code unit has the same advance width. */
export function createFixedCharWidthMeasure(charAdvancePx: number): EskerraTextWidthMeasure {
  return (text: string) => text.length * charAdvancePx;
}

export function eskerraCellInnerWidthPx(
  gridWidthPx: number,
  colCount: number,
  cellPaddingInlinePx: number = ESKERRA_RDG_CELL_PADDING_INLINE_PX,
): number {
  if (colCount <= 0 || gridWidthPx <= 0) {
    return 0;
  }
  return Math.max(0, gridWidthPx / colCount - 2 * cellPaddingInlinePx);
}

function wrappedLinesForOverflowWord(
  word: string,
  maxWidth: number,
  measure: EskerraTextWidthMeasure,
): number {
  let n = 0;
  let start = 0;
  while (start < word.length) {
    let end = word.length;
    while (end > start && measure(word.slice(start, end)) > maxWidth) {
      end -= 1;
    }
    if (end === start) {
      end = start + 1;
    }
    n += 1;
    start = end;
  }
  return n;
}

function linesForParagraph(
  paragraph: string,
  maxWidth: number,
  measure: EskerraTextWidthMeasure,
): number {
  if (paragraph === '') {
    return 1;
  }
  let lineCount = 0;
  let line = '';
  const words = paragraph.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) {
    return 1;
  }
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lineCount += 1;
      line = '';
    }
    if (measure(word) <= maxWidth) {
      line = word;
    } else {
      lineCount += wrappedLinesForOverflowWord(word, maxWidth, measure);
    }
  }
  if (line) {
    lineCount += 1;
  }
  return lineCount;
}

/** Visual lines for a cell value, including explicit newlines and word wrap. */
export function countVisualLinesInCell(
  text: string,
  maxInnerWidthPx: number,
  measure: EskerraTextWidthMeasure,
): number {
  if (maxInnerWidthPx <= 0) {
    return 1;
  }
  const paragraphs = text.split('\n');
  let total = 0;
  for (const p of paragraphs) {
    total += linesForParagraph(p, maxInnerWidthPx, measure);
  }
  return Math.max(1, total);
}

export function eskerraGridRowHeightPx(params: {
  row: Record<string, string>;
  colCount: number;
  gridWidthPx: number;
  measure: EskerraTextWidthMeasure;
  lineHeightPx?: number;
  verticalPaddingPx?: number;
  cellPaddingInlinePx?: number;
  minRowPx?: number;
}): number {
  const lineHeightPx = params.lineHeightPx ?? ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX;
  const verticalPaddingPx = params.verticalPaddingPx ?? ESKERRA_TABLE_CELL_VERTICAL_PADDING_PX;
  const cellPaddingInlinePx = params.cellPaddingInlinePx ?? ESKERRA_RDG_CELL_PADDING_INLINE_PX;
  const minRowPx = params.minRowPx ?? ESKERRA_TABLE_MIN_ROW_HEIGHT_PX;

  const inner = eskerraCellInnerWidthPx(params.gridWidthPx, params.colCount, cellPaddingInlinePx);
  let maxLines = 1;
  for (let j = 0; j < params.colCount; j += 1) {
    const text = params.row[`col_${j}`] ?? '';
    maxLines = Math.max(maxLines, countVisualLinesInCell(text, inner, params.measure));
  }
  return Math.max(minRowPx, verticalPaddingPx + maxLines * lineHeightPx);
}

export function sumEskerraGridRowHeights(params: {
  rows: Record<string, string>[];
  colCount: number;
  gridWidthPx: number;
  measure: EskerraTextWidthMeasure;
  lineHeightPx?: number;
  verticalPaddingPx?: number;
  cellPaddingInlinePx?: number;
  minRowPx?: number;
}): number {
  let sum = 0;
  for (const row of params.rows) {
    sum += eskerraGridRowHeightPx({
      row,
      colCount: params.colCount,
      gridWidthPx: params.gridWidthPx,
      measure: params.measure,
      lineHeightPx: params.lineHeightPx,
      verticalPaddingPx: params.verticalPaddingPx,
      cellPaddingInlinePx: params.cellPaddingInlinePx,
      minRowPx: params.minRowPx,
    });
  }
  return sum;
}
