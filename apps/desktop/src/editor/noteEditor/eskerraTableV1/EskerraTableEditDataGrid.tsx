import 'react-data-grid/lib/styles.css';

import {type EskerraTableModelV1} from '@notebox/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import {
  DataGrid,
  type CellKeyDownArgs,
  type CellKeyboardEvent,
  type DataGridHandle,
  type RenderEditCellProps,
} from 'react-data-grid';

import {MaterialIcon} from '../../../components/MaterialIcon';

import {clipboardMatrixFromClipboardEvent} from './eskerraTableClipboard';
import {
  createFixedCharWidthMeasure,
  eskerraGridRowHeightPx,
  ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX,
  parseComputedLineHeightPx,
  sumEskerraGridRowHeights,
  type EskerraTextWidthMeasure,
} from './eskerraTableWrappedRowHeight';

export type EskerraTableEditDataGridProps = {
  initialModel: EskerraTableModelV1;
  onCommit: (cells: string[][], moveCursorBelow: boolean) => void;
  onDiscard: () => void;
  onLeaveMarkdown: () => void;
  /** Notifies when pixel height of the grid may have changed (for CodeMirror.requestMeasure). */
  onTableGridLayoutChange?: () => void;
};

/** Stable row id for react-data-grid (not a table column). */
const ESKERRA_GRID_ROW_ID = '__eskerra_grid_row_id';

type EskerraGridRow = Record<string, string>;

function colKey(j: number): string {
  return `col_${j}`;
}

function modelToGridRows(cells: string[][]): EskerraGridRow[] {
  return cells.map((row, i) => {
    const o: EskerraGridRow = {[ESKERRA_GRID_ROW_ID]: String(i)};
    for (let j = 0; j < row.length; j += 1) {
      o[colKey(j)] = row[j] ?? '';
    }
    return o;
  });
}

function gridRowsToCells(rows: EskerraGridRow[], colCount: number): string[][] {
  return rows.map(r =>
    Array.from({length: colCount}, (_, j) => r[colKey(j)] ?? ''),
  );
}

function remapRowKeys(list: EskerraGridRow[]): EskerraGridRow[] {
  return list.map((r, i) => ({...r, [ESKERRA_GRID_ROW_ID]: String(i)}));
}

const GRID_VIEWPORT_MAX_BLOCK_PX = 560;

/** Focus moved to CodeMirror (e.g. click beside table); avoid selectCell+scrollIntoView or RDG can scroll the grid out of view. */
function isFocusInCodemirrorOutsideShell(shell: HTMLElement, active: Element | null): boolean {
  if (!(active instanceof Element)) {
    return false;
  }
  if (shell.contains(active)) {
    return false;
  }
  return active.closest('.cm-editor') !== null;
}

type TextareaEditorNav = {
  rowsRef: RefObject<EskerraGridRow[]>;
  gridRef: RefObject<DataGridHandle | null>;
  colCount: number;
  onCommit: EskerraTableEditDataGridProps['onCommit'];
  onDiscard: EskerraTableEditDataGridProps['onDiscard'];
  /** Mirrors draft cell text into parent `rows` so `rowHeight` tracks typing (RDG keeps edit state internal until commit). */
  onLiveRowSync: (rowIdx: number, nextRow: EskerraGridRow) => void;
  /** After closing a cell editor, ask CodeMirror to remeasure the table widget (avoids blank grid when selectCell is skipped). */
  scheduleEditorRemeasure: () => void;
};

function EskerraTableTextareaEditor({
  column,
  row,
  rowIdx,
  onRowChange,
  onClose,
  nav,
}: RenderEditCellProps<EskerraGridRow> & {nav: TextareaEditorNav}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) {
      return;
    }
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  const key = column.key;

  return (
    <textarea
      ref={taRef}
      className="rdg-text-editor"
      value={row[key] ?? ''}
      onChange={e => {
        const next = {...row, [key]: e.target.value};
        onRowChange(next);
        nav.onLiveRowSync(rowIdx, next);
      }}
      onBlur={() => {
        onClose(true, false);
        nav.scheduleEditorRemeasure();
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          nav.onDiscard();
          return;
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          const v = e.currentTarget.value;
          const base = gridRowsToCells(nav.rowsRef.current ?? [], nav.colCount).map(r => [...r]);
          base[rowIdx]![column.idx] = v;
          nav.onCommit(base, false);
          return;
        }
        // Enter: next row (like single-line editor). Shift+Enter inserts a newline.
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const v = e.currentTarget.value;
          const nextRow = {...row, [key]: v};
          onRowChange(nextRow);
          nav.onLiveRowSync(rowIdx, nextRow);
          const rows = nav.rowsRef.current ?? [];
          const lastRow = rowIdx >= rows.length - 1;
          if (!lastRow) {
            flushSync(() => {
              onClose(true, true);
            });
            requestAnimationFrame(() => {
              nav.gridRef.current?.selectCell(
                {rowIdx: rowIdx + 1, idx: column.idx},
                {enableEditor: true, shouldFocusCell: true},
              );
            });
          } else {
            const cellsToCommit = gridRowsToCells(rows, nav.colCount).map(r => [...r]);
            cellsToCommit[rowIdx]![column.idx] = v;
            nav.onCommit(cellsToCommit, true);
          }
        }
      }}
    />
  );
}

export function EskerraTableEditDataGrid({
  initialModel,
  onCommit,
  onDiscard,
  onLeaveMarkdown,
  onTableGridLayoutChange,
}: EskerraTableEditDataGridProps) {
  const colCount = initialModel.cells[0]?.length ?? 0;
  const [initialDraftFingerprint] = useState(
    () => JSON.stringify(initialModel.cells.map(row => [...row])),
  );

  const [rows, setRows] = useState<EskerraGridRow[]>(() =>
    remapRowKeys(modelToGridRows(initialModel.cells)),
  );
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  /** Bumps when react-data-grid must fully remount after we skip selectCell (avoids stuck blank viewport). */
  const [rdgRemountKey, setRdgRemountKey] = useState(0);

  const gridRef = useRef<DataGridHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({rowIdx: 0, colIdx: 0});
  const rowsRef = useRef(rows);
  const layoutSyncRef = useRef<() => void>(() => {});
  /** When selectCell is skipped (focus in CM outside shell), RDG can paint a blank grid; remount grid + remeasure. */
  const healAfterSkippedSelectRef = useRef<() => void>(() => {});

  const [layoutMetrics, setLayoutMetrics] = useState<{
    gridWidthPx: number;
    measure: EskerraTextWidthMeasure;
    widthForMath: number;
    lineHeightPx: number;
  }>(() => ({
    gridWidthPx: 0,
    measure: createFixedCharWidthMeasure(7),
    widthForMath: 320,
    lineHeightPx: ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX,
  }));

  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useLayoutEffect(() => {
    layoutSyncRef.current = () => {
      queueMicrotask(() => {
        onTableGridLayoutChange?.();
        requestAnimationFrame(() => {
          onTableGridLayoutChange?.();
        });
      });
    };
  }, [onTableGridLayoutChange]);

  useLayoutEffect(() => {
    healAfterSkippedSelectRef.current = () => {
      queueMicrotask(() => {
        const sel = selectionRef.current;
        setRdgRemountKey(k => k + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            gridRef.current?.selectCell(
              {rowIdx: sel.rowIdx, idx: sel.colIdx},
              {shouldFocusCell: false, enableEditor: false},
            );
            onTableGridLayoutChange?.();
            requestAnimationFrame(() => {
              onTableGridLayoutChange?.();
            });
          });
        });
      });
    };
  }, [onTableGridLayoutChange]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const pushMetrics = (width: number) => {
      const w =
        width > 0
          ? width
          : Math.max(1, wrap.getBoundingClientRect().width);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let measure: EskerraTextWidthMeasure = createFixedCharWidthMeasure(7);
      const style = getComputedStyle(wrap);
      if (ctx) {
        ctx.font = style.font;
        measure = (s: string) => ctx.measureText(s).width;
      }
      const lineHeightPx = parseComputedLineHeightPx(
        style.lineHeight,
        ESKERRA_TABLE_WRAP_LINE_HEIGHT_PX,
      );
      queueMicrotask(() => {
        setLayoutMetrics({gridWidthPx: width, measure, widthForMath: w, lineHeightPx});
      });
    };
    const ro = new ResizeObserver(entries => {
      pushMetrics(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(wrap);
    pushMetrics(wrap.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const isDirty = useMemo(
    () =>
      JSON.stringify(gridRowsToCells(rows, colCount)) !== initialDraftFingerprint,
    [rows, colCount, initialDraftFingerprint],
  );

  const columnEditorOptions = useMemo(
    () =>
      ({
        commitOnOutsideClick: false,
        closeOnExternalRowChange: false,
      }) as const,
    [],
  );

  const onLiveRowSync = useCallback((rowIdx: number, nextRow: EskerraGridRow) => {
    setRows(prev => {
      if (rowIdx < 0 || rowIdx >= prev.length) {
        return prev;
      }
      return remapRowKeys(prev.map((r, i) => (i === rowIdx ? {...nextRow} : r)));
    });
  }, []);

  const scheduleEditorRemeasure = useCallback(() => {
    layoutSyncRef.current();
  }, []);

  const editorNav = useMemo(
    (): TextareaEditorNav => ({
      rowsRef,
      gridRef,
      colCount,
      onCommit,
      onDiscard,
      onLiveRowSync,
      scheduleEditorRemeasure,
    }),
    [colCount, onCommit, onDiscard, onLiveRowSync, scheduleEditorRemeasure],
  );

  /** No RDG header row labels: Markdown row 0 is the real header (avoids duplicate “File | Contents”). */
  const columns = useMemo(
    () =>
      Array.from({length: colCount}, (_, i) => ({
        key: colKey(i),
        name: `Column ${i + 1}`,
        renderHeaderCell: () => (
          <span className="cm-eskerra-table-rdg__vh">{`Column ${i + 1}`}</span>
        ),
        editable: true,
        renderEditCell: (p: RenderEditCellProps<EskerraGridRow>) => (
          <EskerraTableTextareaEditor {...p} nav={editorNav} />
        ),
        resizable: false,
        sortable: false,
        draggable: false,
        editorOptions: columnEditorOptions,
      })),
    [colCount, columnEditorOptions, editorNav],
  );

  const applyPasteFromMatrix = useCallback((matrix: string[][], rowIdx: number, colIdx: number) => {
    if (colCount === 0 || matrix.length === 0) {
      return;
    }
    const sourceRows = matrix.length;
    const sourceCols = Math.max(...matrix.map(r => r.length), 0);
    setRows(prev => {
      const rowCap = prev.length - rowIdx;
      const colCap = colCount - colIdx;
      const appliedRows = Math.max(0, Math.min(sourceRows, rowCap));
      const appliedCols = Math.max(0, Math.min(sourceCols, colCap));
      const next = prev.map(r => ({...r}));
      for (let r = 0; r < appliedRows; r += 1) {
        for (let c = 0; c < appliedCols; c += 1) {
          next[r + rowIdx]![colKey(c + colIdx)] = matrix[r]?.[c] ?? '';
        }
      }
      const clipped = appliedRows < sourceRows || appliedCols < sourceCols;
      queueMicrotask(() => {
        setPasteNotice(
          clipped ? `Pasted ${appliedRows}×${appliedCols} of ${sourceRows}×${sourceCols}` : null,
        );
      });
      return remapRowKeys(next);
    });
  }, [colCount]);

  const onPasteCapture = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const matrix = clipboardMatrixFromClipboardEvent(e.nativeEvent);
      if (matrix.length === 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const {rowIdx, colIdx} = selectionRef.current;
      applyPasteFromMatrix(matrix, rowIdx, colIdx);
    },
    [applyPasteFromMatrix],
  );

  const onCellKeyDown = useCallback(
    (args: CellKeyDownArgs<EskerraGridRow>, event: CellKeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventGridDefault();
        onDiscard();
        return;
      }

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventGridDefault();
        const base = gridRowsToCells(rows, colCount).map(r => [...r]);
        const cellsToCommit =
          args.mode === 'EDIT'
            ? (() => {
                const {rowIdx, column, row} = args;
                const next = base.map(r => [...r]);
                next[rowIdx]![column.idx] = row[colKey(column.idx)] ?? '';
                return next;
              })()
            : base;
        onCommit(cellsToCommit, false);
        return;
      }

      if (
        event.key === 'Enter'
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && args.mode === 'EDIT'
      ) {
        const {rowIdx, column, row, onClose} = args;
        const lastRow = rowIdx >= rows.length - 1;
        event.preventGridDefault();
        if (!lastRow) {
          flushSync(() => {
            onClose(true, true);
          });
          requestAnimationFrame(() => {
            gridRef.current?.selectCell(
              {rowIdx: rowIdx + 1, idx: column.idx},
              {enableEditor: true, shouldFocusCell: true},
            );
          });
        } else {
          const cellsToCommit = gridRowsToCells(rows, colCount).map(r => [...r]);
          cellsToCommit[rowIdx]![column.idx] = row[colKey(column.idx)] ?? '';
          onCommit(cellsToCommit, true);
        }
      }
    },
    [colCount, onCommit, onDiscard, rows],
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const onFocusOut = () => {
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active instanceof Node && shell.contains(active)) {
          return;
        }
        if (isFocusInCodemirrorOutsideShell(shell, active)) {
          healAfterSkippedSelectRef.current();
          return;
        }
        if (active instanceof Element && active.tagName === 'BODY') {
          requestAnimationFrame(() => {
            const a2 = document.activeElement;
            const sel = selectionRef.current;
            if (a2 instanceof Node && shell.contains(a2)) {
              gridRef.current?.selectCell(
                {rowIdx: sel.rowIdx, idx: sel.colIdx},
                {shouldFocusCell: false, enableEditor: false},
              );
              return;
            }
            if (isFocusInCodemirrorOutsideShell(shell, a2)) {
              healAfterSkippedSelectRef.current();
              return;
            }
            gridRef.current?.selectCell(
              {rowIdx: sel.rowIdx, idx: sel.colIdx},
              {shouldFocusCell: false, enableEditor: false},
            );
          });
          return;
        }
        const {rowIdx, colIdx} = selectionRef.current;
        gridRef.current?.selectCell(
          {rowIdx, idx: colIdx},
          {shouldFocusCell: true, enableEditor: false},
        );
      });
    };
    shell.addEventListener('focusout', onFocusOut);
    return () => shell.removeEventListener('focusout', onFocusOut);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      gridRef.current?.selectCell(
        {rowIdx: 0, idx: 0},
        {enableEditor: true, shouldFocusCell: true},
      );
    });
  }, []);

  const headerRowHeight = 0;

  const {measure, widthForMath, lineHeightPx} = layoutMetrics;

  const totalRowPixels = useMemo(
    () =>
      sumEskerraGridRowHeights({
        rows,
        colCount,
        gridWidthPx: widthForMath,
        measure,
        lineHeightPx,
      }),
    [rows, colCount, widthForMath, measure, lineHeightPx],
  );

  const rowHeightForRow = useCallback(
    (row: EskerraGridRow) =>
      eskerraGridRowHeightPx({
        row,
        colCount,
        gridWidthPx: widthForMath,
        measure,
        lineHeightPx,
      }),
    [colCount, widthForMath, measure, lineHeightPx],
  );

  const gridBlockPx = Math.min(
    GRID_VIEWPORT_MAX_BLOCK_PX,
    headerRowHeight + totalRowPixels + 2,
  );

  useLayoutEffect(() => {
    queueMicrotask(() => onTableGridLayoutChange?.());
  }, [
    gridBlockPx,
    totalRowPixels,
    layoutMetrics.gridWidthPx,
    onTableGridLayoutChange,
    rows.length,
    colCount,
    widthForMath,
  ]);

  const addRow = useCallback(() => {
    setRows(prev => {
      const nextRow: EskerraGridRow = {[ESKERRA_GRID_ROW_ID]: String(prev.length)};
      for (let j = 0; j < colCount; j += 1) {
        nextRow[colKey(j)] = '';
      }
      const next = remapRowKeys([...prev.map(r => ({...r})), nextRow]);
      const newIdx = next.length - 1;
      queueMicrotask(() => {
        gridRef.current?.selectCell(
          {rowIdx: newIdx, idx: 0},
          {enableEditor: true, shouldFocusCell: true},
        );
      });
      return next;
    });
    setPasteNotice(null);
  }, [colCount]);

  return (
    <div
      ref={shellRef}
      className="cm-eskerra-table-rdg-shell"
      onPasteCapture={onPasteCapture}
    >
      <div className="cm-eskerra-table__main">
        <div className="cm-eskerra-table__content">
          {pasteNotice !== null && (
            <p className="cm-eskerra-table__notice" role="status">
              {pasteNotice}
            </p>
          )}
          <div ref={wrapRef} className="cm-eskerra-table-rdg-wrap">
            <DataGrid
              key={rdgRemountKey}
              ref={gridRef}
              className="cm-eskerra-table-rdg rdg-light"
              style={
                {
                  blockSize: `${gridBlockPx}px`,
                  '--rdg-border-color':
                    'var(--color-border-subtle, var(--nb-editor-inline-code-border))',
                  '--rdg-border-width': '1px',
                  '--rdg-background-color': 'var(--nb-editor-paper)',
                  '--rdg-header-background-color': 'var(--nb-editor-paper)',
                  '--rdg-row-hover-background-color':
                    'color-mix(in srgb, var(--nb-editor-text) 4%, var(--nb-editor-paper))',
                  '--rdg-row-selected-background-color':
                    'color-mix(in srgb, var(--color-accent) 14%, var(--nb-editor-paper))',
                  '--rdg-row-selected-hover-background-color':
                    'color-mix(in srgb, var(--color-accent) 20%, var(--nb-editor-paper))',
                  '--rdg-color': 'var(--nb-editor-text)',
                  '--rdg-font-size': 'inherit',
                  '--rdg-selection-color': 'var(--color-accent)',
                } as CSSProperties
              }
              columns={columns}
              rows={rows}
              rowKeyGetter={r => r[ESKERRA_GRID_ROW_ID]}
              onRowsChange={next => {
                setRows(remapRowKeys(next as EskerraGridRow[]));
              }}
              onSelectedCellChange={({rowIdx, column}) => {
                selectionRef.current = {rowIdx, colIdx: column.idx};
              }}
              onCellKeyDown={onCellKeyDown}
              rowHeight={rowHeightForRow}
              headerRowHeight={headerRowHeight}
              rowClass={(_row, rowIdx) =>
                rowIdx === 0 ? 'cm-eskerra-table-rdg__header-row' : undefined}
              enableVirtualization={false}
              aria-label="Table cells"
            />
          </div>
        </div>
        <div className="cm-eskerra-table__rail">
          <div className="cm-eskerra-table__rail-top">
            <button
              type="button"
              className="cm-eskerra-table__icon-btn app-tooltip-trigger"
              data-tooltip="Edit as Markdown"
              aria-label="Edit as Markdown"
              onClick={e => {
                e.preventDefault();
                onLeaveMarkdown();
              }}
            >
              <MaterialIcon name="code" size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger"
              data-tooltip="Done"
              aria-label="Done"
              onClick={e => {
                e.preventDefault();
                if (isDirty) {
                  onCommit(gridRowsToCells(rows, colCount), false);
                } else {
                  onDiscard();
                }
              }}
            >
              <MaterialIcon name="check" size={12} aria-hidden />
            </button>
          </div>
          <div className="cm-eskerra-table__rail-bottom">
            <button
              type="button"
              className="cm-eskerra-table__icon-btn app-tooltip-trigger"
              data-tooltip="Add row"
              aria-label="Add row"
              onClick={e => {
                e.preventDefault();
                addRow();
              }}
            >
              <MaterialIcon name="add" size={12} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
