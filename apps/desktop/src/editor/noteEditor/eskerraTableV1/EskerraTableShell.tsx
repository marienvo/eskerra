import type {EskerraTableAlignment, EskerraTableModelV1} from '@notebox/core';
import {EditorState} from '@codemirror/state';
import type {Compartment} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type MutableRefObject,
  type RefObject,
} from 'react';

import type {
  EskerraTableCellKeyboardCallbacks,
  NoteMarkdownCellEditorCallbacks,
} from '../noteMarkdownCellEditor';

let nextEskerraCellPasteSession = 1;

import {clipboardMatrixFromClipboardEvent} from './eskerraTableClipboard';
import {
  eskerraTableCellBundleFacet,
  resolveEskerraTableCellExtensions,
} from './eskerraTableCellBundleFacet';
import {registerEskerraTableDraftFlusher} from './eskerraTableDraftFlush';
import {
  registerEskerraTableNestedCellEditor,
} from './eskerraTableNestedCellEditors';
import {eskerraTableParentLinkCompartmentsFacet} from './eskerraTableParentLinkCompartments';
import {
  commitThenEditTableAsMarkdown,
  flushTableDraftToDocumentSilent,
  restoreTableBaseline,
} from './eskerraTableShellCommits';

export type EskerraTableShellProps = {
  parentView: EditorView;
  headerLineFrom: number;
  baselineText: string;
  initialCells: string[][];
  initialAlign: EskerraTableAlignment[];
};

function modelFromDraft(
  cells: string[][],
  align: EskerraTableAlignment[],
  colCount: number,
): EskerraTableModelV1 {
  const row0 = cells[0];
  const n = row0?.length ?? colCount;
  const alignOut: EskerraTableAlignment[] =
    align.length === n
      ? [...align]
      : Array.from({length: n}, (_, i) => align[i]);
  return {
    cells: cells.map(r => [...r]),
    align: alignOut,
  };
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function EskerraTableShell(props: EskerraTableShellProps): ReactElement {
  const {parentView, headerLineFrom, baselineText, initialCells, initialAlign} = props;

  const [cells, setCells] = useState<string[][]>(() =>
    initialCells.map(r => [...r]),
  );
  const [align, setAlign] = useState<EskerraTableAlignment[]>(() => [
    ...initialAlign,
  ]);
  const [notice, setNotice] = useState<string | null>(null);

  const lineFromRef = useRef(headerLineFrom);
  useEffect(() => {
    lineFromRef.current = headerLineFrom;
  }, [headerLineFrom]);

  const colCount = cells[0]?.length ?? 0;

  const draftRef = useRef({
    cells: initialCells.map(r => [...r]),
    align: [...initialAlign],
  });

  const cellEditorsRef = useRef(new Map<string, EditorView>());

  const linkCompartments = parentView.state.facet(
    eskerraTableParentLinkCompartmentsFacet,
  );
  if (!linkCompartments) {
    throw new Error(
      'eskerraTableParentLinkCompartmentsFacet is missing: NoteMarkdownEditor must register parent wiki / relative link compartments.',
    );
  }

  const activeCellRef = useRef<{row: number; col: number}>({row: 0, col: 0});

  const snapshotAllCellDocs = useCallback((): string[][] => {
    const rowCount = draftRef.current.cells.length;
    const nCols = draftRef.current.cells[0]?.length ?? 0;
    const out: string[][] = Array.from({length: rowCount}, (_, r) =>
      Array.from({length: nCols}, (_, c) => draftRef.current.cells[r]?.[c] ?? ''),
    );
    for (const [key, v] of cellEditorsRef.current) {
      const parts = key.split(',');
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (r >= 0 && r < rowCount && c >= 0 && c < nCols) {
        out[r]![c]! = v.state.doc.toString();
      }
    }
    return out;
  }, []);

  const moveTabFrom = useCallback(
    (fromRow: number, fromCol: number, shift: boolean) => {
      const rowCount = draftRef.current.cells.length;
      const nCols = draftRef.current.cells[0]?.length ?? 0;
      if (rowCount === 0 || nCols === 0) {
        return true;
      }
      let row = fromRow;
      let col = fromCol;
      const dir = shift ? -1 : 1;
      col += dir;
      if (col >= nCols) {
        col = 0;
        row += 1;
      } else if (col < 0) {
        col = nCols - 1;
        row -= 1;
      }
      if (row < 0 || row >= rowCount) {
        return true;
      }
      const nextView = cellEditorsRef.current.get(cellKey(row, col));
      activeCellRef.current = {row, col};
      if (nextView) {
        requestAnimationFrame(() => {
          nextView.focus();
        });
      }
      parentView.requestMeasure();
      return true;
    },
    [parentView],
  );

  const exitToMarkdownSource = useCallback(() => {
    const merged = snapshotAllCellDocs();
    draftRef.current.cells = merged.map(r => [...r]);
    setCells(merged.map(r => [...r]));
    const model = modelFromDraft(
      draftRef.current.cells,
      draftRef.current.align,
      colCount,
    );
    commitThenEditTableAsMarkdown(parentView, lineFromRef.current, model);
  }, [colCount, parentView, snapshotAllCellDocs]);

  const runEnterFrom = useCallback(
    (fromRow: number, fromCol: number) => {
      const rowCount = draftRef.current.cells.length;
      if (fromRow < rowCount - 1) {
        const nextView = cellEditorsRef.current.get(
          cellKey(fromRow + 1, fromCol),
        );
        activeCellRef.current = {row: fromRow + 1, col: fromCol};
        if (nextView) {
          requestAnimationFrame(() => {
            nextView.focus();
          });
        }
        parentView.requestMeasure();
        return true;
      }
      exitToMarkdownSource();
      return true;
    },
    [exitToMarkdownSource, parentView],
  );

  const flushDraft = useCallback(() => {
    const merged = snapshotAllCellDocs();
    draftRef.current.cells = merged.map(r => [...r]);
    const model = modelFromDraft(
      draftRef.current.cells,
      draftRef.current.align,
      colCount,
    );
    const nextLine = flushTableDraftToDocumentSilent(
      parentView,
      lineFromRef.current,
      model,
    );
    if (nextLine != null) {
      lineFromRef.current = nextLine;
    }
  }, [colCount, parentView, snapshotAllCellDocs]);

  useEffect(() => {
    return registerEskerraTableDraftFlusher(lineFromRef, flushDraft);
  }, [flushDraft]);

  useLayoutEffect(() => {
    draftRef.current = {cells, align};
  }, [cells, align]);

  const onAddRow = useCallback(() => {
    const merged = snapshotAllCellDocs();
    draftRef.current.cells = merged.map(r => [...r]);
    const nextRowIndex = merged.length;
    const nCols = merged[0]?.length ?? 0;
    if (nCols === 0) {
      return;
    }
    setCells(() => [
      ...merged.map(r => [...r]),
      Array.from({length: nCols}, () => ''),
    ]);
    activeCellRef.current = {
      row: nextRowIndex,
      col: activeCellRef.current.col,
    };
    parentView.requestMeasure();
  }, [parentView, snapshotAllCellDocs]);

  const onAddColumn = useCallback(() => {
    const merged = snapshotAllCellDocs();
    draftRef.current.cells = merged.map(r => [...r]);
    const nCols = merged[0]?.length ?? 0;
    const nRows = merged.length;
    if (nCols === 0 || nRows === 0) {
      return;
    }
    const newColIndex = nCols;
    const focusRow = Math.min(
      Math.max(activeCellRef.current.row, 0),
      nRows - 1,
    );
    setAlign(prev => [
      ...Array.from({length: nCols}, (_, i) => prev[i]),
      undefined,
    ]);
    setCells(() => merged.map(r => [...r, '']));
    activeCellRef.current = {row: focusRow, col: newColIndex};
    parentView.requestMeasure();
    requestAnimationFrame(() => {
      const nextView = cellEditorsRef.current.get(
        cellKey(focusRow, newColIndex),
      );
      nextView?.focus();
    });
  }, [parentView, snapshotAllCellDocs]);

  const onEditMarkdown = exitToMarkdownSource;

  const onCellDocChange = useCallback((r: number, c: number, text: string) => {
    setCells(prev => {
      if (prev[r]?.[c] === text) {
        return prev;
      }
      const next = prev.map(row => [...row]);
      if (next[r]?.[c] !== undefined) {
        next[r]![c] = text;
      }
      return next;
    });
  }, []);

  const applyClipboardMatrix = useCallback(
    (matrix: string[][]) => {
      if (matrix.length === 0) {
        return;
      }
      const merged = snapshotAllCellDocs();
      const {row: startR, col: startC} = activeCellRef.current;
      const next = merged.map(r => [...r]);
      const nCols0 = next[0]?.length ?? 0;
      for (let dr = 0; dr < matrix.length; dr += 1) {
        const row = matrix[dr]!;
        for (let dc = 0; dc < row.length; dc += 1) {
          const r = startR + dr;
          const c = startC + dc;
          if (r >= next.length || c >= nCols0) {
            continue;
          }
          const v = row[dc] ?? '';
          if (v.includes('|') || v.includes('\n') || v.includes('\r')) {
            continue;
          }
          next[r]![c] = v;
        }
      }
      draftRef.current.cells = next.map(r => [...r]);
      setCells(next.map(r => [...r]));
      requestAnimationFrame(() => {
        for (let dr = 0; dr < matrix.length; dr += 1) {
          const row = matrix[dr]!;
          for (let dc = 0; dc < row.length; dc += 1) {
            const r = startR + dr;
            const c = startC + dc;
            const text = next[r]?.[c];
            if (text === undefined) {
              continue;
            }
            const cellView = cellEditorsRef.current.get(cellKey(r, c));
            if (cellView && cellView.state.doc.toString() !== text) {
              cellView.dispatch({
                changes: {
                  from: 0,
                  to: cellView.state.doc.length,
                  insert: text,
                },
              });
            }
          }
        }
        parentView.requestMeasure();
      });
    },
    [parentView, snapshotAllCellDocs],
  );

  useEffect(() => {
    const el = parentView.scrollDOM;
    const onCapturePaste = (e: Event) => {
      const ce = e as ClipboardEvent;
      const t = ce.target;
      if (!(t instanceof Element) || !t.closest('.cm-eskerra-table-shell-root')) {
        return;
      }
      const matrix = clipboardMatrixFromClipboardEvent(ce);
      const multi =
        matrix.length > 1 || (matrix[0] != null && matrix[0].length > 1);
      if (!multi) {
        return;
      }
      ce.preventDefault();
      ce.stopPropagation();
      applyClipboardMatrix(matrix);
    };
    el.addEventListener('paste', onCapturePaste, true);
    return () => el.removeEventListener('paste', onCapturePaste, true);
  }, [applyClipboardMatrix, parentView]);

  const headerRow = cells[0];
  const bodyRows = cells.slice(1);

  return (
    <div className="cm-eskerra-table-shell">
      {notice ? (
        <div className="cm-eskerra-table__notice" role="status">
          {notice}
        </div>
      ) : null}

      <table className="cm-eskerra-table-shell__table cm-eskerra-table__table">
        <thead>
          <tr>
            {headerRow?.map((text, ci) => (
              <EskerraShellCell
                key={`h-${ci}`}
                row={0}
                col={ci}
                cellText={text}
                isHeader
                align={align[ci]}
                parentView={parentView}
                wikiCompartment={linkCompartments.wikiLink}
                relativeMdLinkCompartment={linkCompartments.relativeMarkdownLink}
                cellEditorsRef={cellEditorsRef}
                setNotice={setNotice}
                activeCellRef={activeCellRef}
                moveTabFrom={moveTabFrom}
                runEnterFrom={runEnterFrom}
                baselineText={baselineText}
                lineFromRef={lineFromRef}
                onCellDocChange={onCellDocChange}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={`br-${ri}`}>
              {row.map((text, ci) => {
                const r = ri + 1;
                return (
                  <EskerraShellCell
                    key={`c-${r}-${ci}`}
                    row={r}
                    col={ci}
                    cellText={text}
                    isHeader={false}
                    align={align[ci]}
                    parentView={parentView}
                    wikiCompartment={linkCompartments.wikiLink}
                    relativeMdLinkCompartment={linkCompartments.relativeMarkdownLink}
                    cellEditorsRef={cellEditorsRef}
                    setNotice={setNotice}
                    activeCellRef={activeCellRef}
                    moveTabFrom={moveTabFrom}
                    runEnterFrom={runEnterFrom}
                    baselineText={baselineText}
                    lineFromRef={lineFromRef}
                    onCellDocChange={onCellDocChange}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div
        className="cm-eskerra-table__rail cm-eskerra-table-shell__rail"
        aria-label="Table actions"
      >
        <div className="cm-eskerra-table__rail-top">
          <button
            type="button"
            className="cm-eskerra-table__icon-btn app-tooltip-trigger"
            data-tooltip="Edit as Markdown"
            aria-label="Edit as Markdown"
            onClick={onEditMarkdown}
          >
            <span className="material-icons cm-eskerra-table__icon-glyph" aria-hidden="true">
              code
            </span>
          </button>
          <button
            type="button"
            className="cm-eskerra-table__icon-btn app-tooltip-trigger"
            data-tooltip="Add column"
            aria-label="Add column"
            onClick={onAddColumn}
          >
            <span className="material-icons cm-eskerra-table__icon-glyph" aria-hidden="true">
              add
            </span>
          </button>
        </div>
        <div className="cm-eskerra-table__rail-bottom">
          <button
            type="button"
            className="cm-eskerra-table__icon-btn app-tooltip-trigger"
            data-tooltip="Add row"
            aria-label="Add row"
            onClick={onAddRow}
          >
            <span className="material-icons cm-eskerra-table__icon-glyph" aria-hidden="true">
              add
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

type ShellCellProps = {
  row: number;
  col: number;
  cellText: string;
  isHeader: boolean;
  align: EskerraTableAlignment | undefined;
  parentView: EditorView;
  wikiCompartment: Compartment;
  relativeMdLinkCompartment: Compartment;
  cellEditorsRef: RefObject<Map<string, EditorView>>;
  setNotice: (msg: string | null) => void;
  activeCellRef: MutableRefObject<{row: number; col: number}>;
  moveTabFrom: (row: number, col: number, shift: boolean) => boolean;
  runEnterFrom: (row: number, col: number) => boolean;
  baselineText: string;
  lineFromRef: MutableRefObject<number>;
  onCellDocChange: (row: number, col: number, text: string) => void;
};

function EskerraShellCell(props: ShellCellProps): ReactElement {
  const {
    row,
    col,
    cellText,
    isHeader,
    align,
    parentView,
    wikiCompartment,
    relativeMdLinkCompartment,
    cellEditorsRef,
    setNotice,
    activeCellRef,
    moveTabFrom,
    runEnterFrom,
    baselineText,
    lineFromRef,
    onCellDocChange,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const tableCallbacksRef = useRef<EskerraTableCellKeyboardCallbacks>({
    onTabFromCell: () => false,
    onEnterFromCell: () => false,
    onEscapeFromCell: () => false,
  });
  const tableCallbacksBox =
    tableCallbacksRef as unknown as NoteMarkdownCellEditorCallbacks;

  const pasteSessionRef = useRef(0);
  const onCellDocChangeRef = useRef(onCellDocChange);
  onCellDocChangeRef.current = onCellDocChange;

  useLayoutEffect(() => {
    const tc = tableCallbacksRef.current;
    tc.onTabFromCell = shift => moveTabFrom(row, col, shift);
    tc.onEnterFromCell = () => runEnterFrom(row, col);
    tc.onEscapeFromCell = () => {
      restoreTableBaseline(parentView, lineFromRef.current, baselineText);
      return true;
    };
  }, [
    baselineText,
    col,
    lineFromRef,
    moveTabFrom,
    parentView,
    row,
    runEnterFrom,
  ]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const pasteSessionId = nextEskerraCellPasteSession++;
    pasteSessionRef.current = pasteSessionId;

    const factory = parentView.state.facet(eskerraTableCellBundleFacet);
    const key = cellKey(row, col);
    const extensions = resolveEskerraTableCellExtensions(
      {
        tableCallbacks: tableCallbacksBox,
        wikiLinkCompartment: wikiCompartment,
        relativeMdLinkCompartment: relativeMdLinkCompartment,
        onDocChanged: () => {
          const v = viewRef.current;
          if (!v) {
            return;
          }
          onCellDocChangeRef.current(row, col, v.state.doc.toString());
        },
        onReportError: msg => {
          setNotice(msg);
          console.error(msg);
        },
        pasteSessionRef,
        pasteSessionId,
      },
      factory,
    );
    const state = EditorState.create({
      doc: cellText,
      extensions,
    });
    const v = new EditorView({parent: host, state});
    viewRef.current = v;
    const cellMap = cellEditorsRef.current!;
    cellMap.set(key, v);
    const unregisterNested = registerEskerraTableNestedCellEditor(
      parentView,
      v,
    );

    parentView.requestMeasure();

    return () => {
      unregisterNested();
      cellMap.delete(key);
      viewRef.current = null;
      v.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per cell; cellText synced below
  }, [row, col, parentView]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v || v.state.doc.toString() === cellText) {
      return;
    }
    v.dispatch({
      changes: {from: 0, to: v.state.doc.length, insert: cellText},
    });
  }, [cellText]);

  const CellTag = isHeader ? 'th' : 'td';
  const ta =
    align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  return (
    <CellTag className="cm-eskerra-table-shell__cell" style={{textAlign: ta}}>
      <div
        ref={hostRef}
        className="cm-eskerra-table-shell__cm-host"
        data-eskerra-cell={`${row},${col}`}
        onFocusCapture={() => {
          activeCellRef.current = {row, col};
        }}
      />
    </CellTag>
  );
}
