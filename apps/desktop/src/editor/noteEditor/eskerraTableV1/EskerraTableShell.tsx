import type {EskerraTableAlignment, EskerraTableModelV1} from '@notebox/core';
import {Compartment, EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type {EskerraTableCellKeyboardCallbacks} from '../noteMarkdownCellEditor';

import {clipboardMatrixFromClipboardEvent} from './eskerraTableClipboard';
import {
  eskerraTableCellBundleFacet,
  resolveEskerraTableCellExtensions,
} from './eskerraTableCellBundleFacet';
import {registerEskerraTableDraftFlusher} from './eskerraTableDraftFlush';
import {
  commitTableDraftFromShell,
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

export function EskerraTableShell(props: EskerraTableShellProps): ReactElement {
  const {parentView, headerLineFrom, baselineText, initialCells, initialAlign} = props;

  const [cells, setCells] = useState<string[][]>(() =>
    initialCells.map(r => [...r]),
  );
  const [align] = useState<EskerraTableAlignment[]>(() => [...initialAlign]);
  const [activeCell, setActiveCell] = useState<{row: number; col: number}>({
    row: 0,
    col: 0,
  });
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

  const cellViewRef = useRef<EditorView | null>(null);
  const cmHostRef = useRef<HTMLDivElement | null>(null);
  const wikiCompartmentRef = useRef<Compartment | null>(null);
  if (wikiCompartmentRef.current === null) {
    wikiCompartmentRef.current = new Compartment();
  }
  const relCompartmentRef = useRef<Compartment | null>(null);
  if (relCompartmentRef.current === null) {
    relCompartmentRef.current = new Compartment();
  }
  const pasteSessionRef = useRef(0);

  const tableCallbacksRef = useRef<EskerraTableCellKeyboardCallbacks>({
    onTabFromCell: () => false,
    onEnterFromCell: () => false,
    onDoneFromCell: () => false,
    onEscapeFromCell: () => false,
  });

  const activeCellRef = useRef(activeCell);

  const snapshotEditorToDraft = useCallback(() => {
    const v = cellViewRef.current;
    const ac = activeCellRef.current;
    if (!v) {
      return;
    }
    const t = v.state.doc.toString();
    setCells(prev => {
      const next = prev.map(r => [...r]);
      if (next[ac.row]?.[ac.col] !== undefined) {
        next[ac.row]![ac.col] = t;
      }
      return next;
    });
  }, []);

  const focusCell = useCallback(
    (row: number, col: number) => {
      snapshotEditorToDraft();
      setActiveCell({row, col});
      setNotice(null);
    },
    [snapshotEditorToDraft],
  );

  const rowCount = cells.length;

  const moveTab = useCallback(
    (shift: boolean) => {
      if (rowCount === 0 || colCount === 0) {
        return true;
      }
      let {row, col} = activeCellRef.current;
      const dir = shift ? -1 : 1;
      col += dir;
      if (col >= colCount) {
        col = 0;
        row += 1;
      } else if (col < 0) {
        col = colCount - 1;
        row -= 1;
      }
      if (row < 0 || row >= rowCount) {
        return true;
      }
      focusCell(row, col);
      parentView.requestMeasure();
      return true;
    },
    [colCount, focusCell, parentView, rowCount],
  );

  const runDone = useCallback(
    (moveCaretBelow: boolean) => {
      snapshotEditorToDraft();
      const model = modelFromDraft(
        draftRef.current.cells,
        draftRef.current.align,
        colCount,
      );
      commitTableDraftFromShell(
        parentView,
        lineFromRef.current,
        model,
        moveCaretBelow,
      );
      return true;
    },
    [colCount, parentView, snapshotEditorToDraft],
  );

  const runEnter = useCallback(() => {
    const {row, col} = activeCellRef.current;
    if (row < rowCount - 1) {
      focusCell(row + 1, col);
      parentView.requestMeasure();
      return true;
    }
    return runDone(true);
  }, [focusCell, parentView, rowCount, runDone]);

  const flushDraft = useCallback(() => {
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
  }, [colCount, parentView]);

  useEffect(() => {
    return registerEskerraTableDraftFlusher(lineFromRef, flushDraft);
  }, [flushDraft]);

  useLayoutEffect(() => {
    draftRef.current = {cells, align};
    activeCellRef.current = activeCell;
  }, [cells, align, activeCell]);

  useLayoutEffect(() => {
    const tc = tableCallbacksRef.current;
    tc.onTabFromCell = shift => moveTab(shift);
    tc.onEnterFromCell = () => runEnter();
    tc.onDoneFromCell = () => runDone(false);
    tc.onEscapeFromCell = () => {
      restoreTableBaseline(parentView, lineFromRef.current, baselineText);
      return true;
    };
  }, [baselineText, moveTab, parentView, runDone, runEnter]);

  useLayoutEffect(() => {
    const row = activeCell.row;
    const col = activeCell.col;
    const host = cmHostRef.current;
    if (!host) {
      return;
    }
    pasteSessionRef.current += 1;
    const pasteSessionId = pasteSessionRef.current;
    cellViewRef.current?.destroy();
    cellViewRef.current = null;

    const initialCellText = draftRef.current.cells[row]?.[col] ?? '';
    const factory = parentView.state.facet(eskerraTableCellBundleFacet);
    const extensions = resolveEskerraTableCellExtensions(
      {
        tableCallbacks: tableCallbacksRef,
        wikiLinkCompartment: wikiCompartmentRef.current!,
        relativeMdLinkCompartment: relCompartmentRef.current!,
        onDocChanged: () => {},
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
      doc: initialCellText,
      extensions,
    });
    const v = new EditorView({parent: host, state});
    cellViewRef.current = v;
    requestAnimationFrame(() => {
      v.focus();
    });
    parentView.requestMeasure();
    return () => {
      const cur = cellViewRef.current;
      if (cur) {
        const textSnapshot = cur.state.doc.toString();
        setCells(prev => {
          const next = prev.map(r => [...r]);
          if (next[row]?.[col] !== undefined) {
            next[row]![col] = textSnapshot;
          }
          return next;
        });
        cur.destroy();
      }
      cellViewRef.current = null;
    };
  }, [activeCell.row, activeCell.col, parentView]);

  const onAddRow = useCallback(() => {
    snapshotEditorToDraft();
    const nextRowIndex = cells.length;
    const nCols = cells[0]?.length ?? 0;
    if (nCols === 0) {
      return;
    }
    setCells(prev => [
      ...prev.map(r => [...r]),
      Array.from({length: nCols}, () => ''),
    ]);
    setActiveCell(ac => ({row: nextRowIndex, col: ac.col}));
    parentView.requestMeasure();
  }, [cells, parentView, snapshotEditorToDraft]);

  const onEditMarkdown = useCallback(() => {
    snapshotEditorToDraft();
    const model = modelFromDraft(
      draftRef.current.cells,
      draftRef.current.align,
      colCount,
    );
    commitThenEditTableAsMarkdown(parentView, lineFromRef.current, model);
  }, [colCount, parentView, snapshotEditorToDraft]);

  const onDoneClick = useCallback(() => {
    runDone(false);
  }, [runDone]);

  const applyClipboardMatrix = useCallback(
    (matrix: string[][]) => {
      if (matrix.length === 0) {
        return;
      }
      snapshotEditorToDraft();
      setCells(prev => {
        const next = prev.map(r => [...r]);
        const {row: startR, col: startC} = activeCellRef.current;
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
        return next;
      });
      parentView.requestMeasure();
    },
    [parentView, snapshotEditorToDraft],
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
      <div className="cm-eskerra-table-shell__toolbar">
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
          data-tooltip="Add row"
          aria-label="Add row"
          onClick={onAddRow}
        >
          <span className="material-icons cm-eskerra-table__icon-glyph" aria-hidden="true">
            add
          </span>
        </button>
        <button
          type="button"
          className="cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger"
          data-tooltip="Done"
          aria-label="Done"
          onClick={onDoneClick}
        >
          <span className="material-icons cm-eskerra-table__icon-glyph" aria-hidden="true">
            check
          </span>
        </button>
      </div>

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
                text={text}
                isHeader
                align={align[ci]}
                isActive={activeCell.row === 0 && activeCell.col === ci}
                cmHostRef={
                  activeCell.row === 0 && activeCell.col === ci ? cmHostRef : undefined
                }
                onActivate={() => focusCell(0, ci)}
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
                    text={text}
                    isHeader={false}
                    align={align[ci]}
                    isActive={activeCell.row === r && activeCell.col === ci}
                    cmHostRef={
                      activeCell.row === r && activeCell.col === ci ? cmHostRef : undefined
                    }
                    onActivate={() => focusCell(r, ci)}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EskerraShellCell(props: {
  text: string;
  isHeader: boolean;
  align: EskerraTableAlignment | undefined;
  isActive: boolean;
  cmHostRef?: React.RefObject<HTMLDivElement | null>;
  onActivate: () => void;
}): ReactElement {
  const {text, isHeader, align, isActive, cmHostRef, onActivate} = props;
  const CellTag = isHeader ? 'th' : 'td';
  const ta =
    align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const preview = text.trim() === '' ? '\u00a0' : text;
  return (
    <CellTag
      className={
        isActive
          ? 'cm-eskerra-table-shell__cell cm-eskerra-table-shell__cell--active'
          : 'cm-eskerra-table-shell__cell'
      }
      style={{textAlign: ta}}
      onMouseDown={e => {
        if (isActive || e.button !== 0) {
          return;
        }
        onActivate();
      }}
    >
      {isActive && cmHostRef ? (
        <div ref={cmHostRef} className="cm-eskerra-table-shell__cm-host" />
      ) : (
        <div className="cm-eskerra-table-shell__idle-text">{preview}</div>
      )}
    </CellTag>
  );
}
