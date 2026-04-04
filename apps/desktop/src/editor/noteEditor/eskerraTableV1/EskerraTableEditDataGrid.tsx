import 'react-data-grid/lib/styles.css';

import {type EskerraTableModelV1} from '@notebox/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
} from 'react';
import {flushSync} from 'react-dom';
import {
  DataGrid,
  renderTextEditor,
  type CellKeyDownArgs,
  type CellKeyboardEvent,
  type DataGridHandle,
} from 'react-data-grid';

import {MaterialIcon} from '../../../components/MaterialIcon';

import {clipboardMatrixFromClipboardEvent} from './eskerraTableClipboard';

export type EskerraTableEditDataGridProps = {
  initialModel: EskerraTableModelV1;
  onCommit: (cells: string[][], moveCursorBelow: boolean) => void;
  onDiscard: () => void;
  onLeaveMarkdown: () => void;
};

/** Stable row id for react-data-grid (not a table column). */
const GRID_ROW_ID = '__eskerra_grid_row_id';

type EskerraGridRow = Record<string, string>;

function colKey(j: number): string {
  return `col_${j}`;
}

function modelToGridRows(cells: string[][]): EskerraGridRow[] {
  return cells.map((row, i) => {
    const o: EskerraGridRow = {[GRID_ROW_ID]: String(i)};
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
  return list.map((r, i) => ({...r, [GRID_ROW_ID]: String(i)}));
}

export function EskerraTableEditDataGrid({
  initialModel,
  onCommit,
  onDiscard,
  onLeaveMarkdown,
}: EskerraTableEditDataGridProps) {
  const colCount = initialModel.cells[0]?.length ?? 0;
  const [initialDraftFingerprint] = useState(
    () => JSON.stringify(initialModel.cells.map(row => [...row])),
  );

  const [rows, setRows] = useState<EskerraGridRow[]>(() =>
    remapRowKeys(modelToGridRows(initialModel.cells)),
  );
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  const gridRef = useRef<DataGridHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({rowIdx: 0, colIdx: 0});

  const isDirty = useMemo(
    () =>
      JSON.stringify(gridRowsToCells(rows, colCount)) !== initialDraftFingerprint,
    [rows, colCount, initialDraftFingerprint],
  );

  const columnEditorOptions = useMemo(
    () =>
      ({
        // Required: Eskerra must not commit on outside mousedown/blur (Markdown widget contract).
        commitOnOutsideClick: false,
      }) as const,
    [],
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
        renderEditCell: renderTextEditor,
        resizable: false,
        sortable: false,
        draggable: false,
        editorOptions: columnEditorOptions,
      })),
    [colCount, columnEditorOptions],
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

  const rowHeight = 34;
  /** Hide react-data-grid’s column header strip (Markdown supplies the header in row 0). */
  const headerRowHeight = 0;
  const gridBlockPx = Math.min(
    420,
    headerRowHeight + rows.length * rowHeight + 2,
  );

  const addRow = useCallback(() => {
    setRows(prev => {
      const nextRow: EskerraGridRow = {[GRID_ROW_ID]: String(prev.length)};
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
      <div className="cm-eskerra-table__actions">
        <button
          type="button"
          className="cm-eskerra-table__button"
          onClick={e => {
            e.preventDefault();
            addRow();
          }}
        >
          Add row
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
      </div>
      {pasteNotice !== null && (
        <p className="cm-eskerra-table__notice" role="status">
          {pasteNotice}
        </p>
      )}
      <div className="cm-eskerra-table-rdg-wrap">
        <DataGrid
          ref={gridRef}
          className="cm-eskerra-table-rdg rdg-light"
          style={
            {
              blockSize: `${gridBlockPx}px`,
              '--rdg-border-color': 'var(--color-border-subtle, var(--nb-editor-inline-code-border))',
              '--rdg-border-width': '1px',
              '--rdg-background-color': 'var(--nb-editor-paper)',
              '--rdg-header-background-color': 'var(--nb-editor-paper)',
              '--rdg-row-hover-background-color': 'color-mix(in srgb, var(--nb-editor-text) 4%, var(--nb-editor-paper))',
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
          rowKeyGetter={r => r[GRID_ROW_ID]}
          onRowsChange={next => {
            setRows(remapRowKeys(next as EskerraGridRow[]));
          }}
          onSelectedCellChange={({rowIdx, column}) => {
            selectionRef.current = {rowIdx, colIdx: column.idx};
          }}
          onCellKeyDown={onCellKeyDown}
          rowHeight={rowHeight}
          headerRowHeight={headerRowHeight}
          rowClass={(_row, rowIdx) =>
            rowIdx === 0 ? 'cm-eskerra-table-rdg__header-row' : undefined}
          enableVirtualization={false}
          aria-label="Table cells"
        />
      </div>
    </div>
  );
}
