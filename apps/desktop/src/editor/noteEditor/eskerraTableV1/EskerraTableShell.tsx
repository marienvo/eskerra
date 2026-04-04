import type {EskerraTableAlignment, EskerraTableModelV1} from '@notebox/core';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {EditorState} from '@codemirror/state';
import type {Compartment} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {flushSync} from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type MutableRefObject,
  type ReactNode,
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
import {
  applyColumnPermutation,
  bodyRowReorderPermutation,
  columnReorderPermutation,
  deleteBodyRowAt,
  duplicateBodyRowAt,
  duplicateColumnAt,
  insertBodyRowAt,
  insertColumnAt,
  moveBodyRowBefore,
  moveBodyRowStep,
  moveColumnStep,
  removeColumnAt,
  setColumnAlignment,
  sortBodyByColumn,
} from './eskerraTableRowColOps';

/** First paint: only this many body rows get nested CodeMirror; rest follow via rAF (spread main-thread cost). */
const ESKERRA_TABLE_INITIAL_BODY_ROWS = 6;
const ESKERRA_TABLE_BODY_ROW_HYDRATION_STEP = 14;

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

function isIdentityPermutation(perm: number[]): boolean {
  return perm.every((v, i) => v === i);
}

function pickColumnDropIndex(clientX: number, rects: DOMRect[]): number {
  const n = rects.length;
  let k = 0;
  for (; k < n; k += 1) {
    const mid =
      k === n - 1 ? rects[k]!.right : (rects[k]!.right + rects[k + 1]!.left) / 2;
    if (clientX < mid) {
      return k;
    }
  }
  return n;
}

function pickRowDropIndex(clientY: number, rects: DOMRect[]): number {
  const n = rects.length;
  let k = 0;
  for (; k < n; k += 1) {
    const mid =
      k === n - 1
        ? rects[k]!.bottom
        : (rects[k]!.bottom + rects[k + 1]!.top) / 2;
    if (clientY < mid) {
      return k;
    }
  }
  return n;
}

function columnDropBarViewport(rects: DOMRect[], drop: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  const n = rects.length;
  if (n === 0) {
    return null;
  }
  let top = Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  let x: number;
  if (drop <= 0) {
    x = rects[0]!.left;
  } else if (drop >= n) {
    x = rects[n - 1]!.right;
  } else {
    x = (rects[drop - 1]!.right + rects[drop]!.left) / 2;
  }
  return {left: x - 2, top, width: 4, height: Math.max(bottom - top, 8)};
}

function rowDropBarViewport(rects: DOMRect[], drop: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  const n = rects.length;
  if (n === 0) {
    return null;
  }
  let left = Infinity;
  let right = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  let y: number;
  if (drop <= 0) {
    y = rects[0]!.top;
  } else if (drop >= n) {
    y = rects[n - 1]!.bottom;
  } else {
    y = (rects[drop - 1]!.bottom + rects[drop]!.top) / 2;
  }
  return {left, top: y - 2, width: Math.max(right - left, 8), height: 4};
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
  const bodyRowCount = Math.max(0, cells.length - 1);
  const tableStructureKey = `${headerLineFrom}:${bodyRowCount}:${colCount}`;
  const prevTableStructureKeyRef = useRef(tableStructureKey);
  const [hydratedBodyRowCount, setHydratedBodyRowCount] = useState(() =>
    Math.min(
      ESKERRA_TABLE_INITIAL_BODY_ROWS,
      Math.max(0, initialCells.length - 1),
    ),
  );

  useEffect(() => {
    if (prevTableStructureKeyRef.current !== tableStructureKey) {
      prevTableStructureKeyRef.current = tableStructureKey;
      setHydratedBodyRowCount(
        Math.min(ESKERRA_TABLE_INITIAL_BODY_ROWS, bodyRowCount),
      );
    }
  }, [tableStructureKey, bodyRowCount]);

  useEffect(() => {
    setHydratedBodyRowCount(c => Math.min(c, bodyRowCount));
  }, [bodyRowCount]);

  useEffect(() => {
    if (hydratedBodyRowCount >= bodyRowCount) {
      return;
    }
    const id = requestAnimationFrame(() => {
      setHydratedBodyRowCount(n =>
        Math.min(bodyRowCount, n + ESKERRA_TABLE_BODY_ROW_HYDRATION_STEP),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [hydratedBodyRowCount, bodyRowCount]);

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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<null | {kind: 'col' | 'row'; source: number}>(
    null,
  );
  const lastPointerRef = useRef({x: 0, y: 0});
  const [dropLine, setDropLine] = useState<null | {
    left: number;
    top: number;
    width: number;
    height: number;
  }>(null);
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [rowHandleGeom, setRowHandleGeom] = useState<
    readonly {readonly top: number; readonly height: number}[]
  >([]);
  const [hoveredBodyRow, setHoveredBodyRow] = useState<number | null>(null);

  const leaveRowHover = useCallback((bodyIndex: number, e: MouseEvent) => {
    const next = e.relatedTarget as HTMLElement | null;
    if (next?.closest(`[data-eskerra-row-hover="${bodyIndex}"]`)) {
      return;
    }
    setHoveredBodyRow(h => (h === bodyIndex ? null : h));
  }, []);

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
      const nBody = Math.max(0, rowCount - 1);
      let nextView = cellEditorsRef.current.get(cellKey(row, col));
      if (!nextView && row >= 1) {
        const bi = row - 1;
        if (bi < nBody) {
          flushSync(() => {
            setHydratedBodyRowCount(nBody);
          });
          nextView = cellEditorsRef.current.get(cellKey(row, col));
        }
      }
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
        const nBody = Math.max(0, rowCount - 1);
        const targetRow = fromRow + 1;
        let nextView = cellEditorsRef.current.get(
          cellKey(targetRow, fromCol),
        );
        if (!nextView && targetRow >= 1) {
          const bi = targetRow - 1;
          if (bi < nBody) {
            flushSync(() => {
              setHydratedBodyRowCount(nBody);
            });
            nextView = cellEditorsRef.current.get(
              cellKey(targetRow, fromCol),
            );
          }
        }
        activeCellRef.current = {row: targetRow, col: fromCol};
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

  useEffect(() => {
    draftRef.current = {cells, align};
    parentView.requestMeasure();
  }, [cells, align, parentView]);

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
      const nextBody = Math.max(0, next.length - 1);
      flushSync(() => {
        setHydratedBodyRowCount(nextBody);
        setCells(next.map(r => [...r]));
      });
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

  const measureColumnHeaderElements = useCallback((): HTMLElement[] => {
    const root = shellRef.current;
    if (!root) {
      return [];
    }
    return Array.from(
      root.querySelectorAll<HTMLElement>('[data-eskerra-col-header]'),
    ).sort(
      (a, b) =>
        Number(a.getAttribute('data-eskerra-col-header')) -
        Number(b.getAttribute('data-eskerra-col-header')),
    );
  }, []);

  const measureColumnRects = useCallback((): DOMRect[] => {
    return measureColumnHeaderElements().map(el => el.getBoundingClientRect());
  }, [measureColumnHeaderElements]);

  const measureBodyRowElements = useCallback((): HTMLElement[] => {
    const root = shellRef.current;
    if (!root) {
      return [];
    }
    return Array.from(
      root.querySelectorAll<HTMLElement>('[data-eskerra-body-row]'),
    ).sort(
      (a, b) =>
        Number(a.getAttribute('data-eskerra-body-row')) -
        Number(b.getAttribute('data-eskerra-body-row')),
    );
  }, []);

  const measureBodyRowRects = useCallback((): DOMRect[] => {
    return measureBodyRowElements().map(el => el.getBoundingClientRect());
  }, [measureBodyRowElements]);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const measure = () => {
      const rows = Array.from(
        sheet.querySelectorAll<HTMLElement>('[data-eskerra-body-row]'),
      ).sort(
        (a, b) =>
          Number(a.getAttribute('data-eskerra-body-row')) -
          Number(b.getAttribute('data-eskerra-body-row')),
      );
      const sr = sheet.getBoundingClientRect();
      setRowHandleGeom(
        rows.map(tr => {
          const br = tr.getBoundingClientRect();
          return {
            top: br.top - sr.top,
            height: br.height,
          };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    const tbl = sheet.querySelector('table');
    if (tbl) {
      ro.observe(tbl);
    }
    for (const el of sheet.querySelectorAll<HTMLElement>(
      '[data-eskerra-body-row]',
    )) {
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [cells.length, notice, colCount, hydratedBodyRowCount]);

  useEffect(() => {
    if (!isDraggingTable) {
      return;
    }
    const doc = parentView.dom.ownerDocument;
    const win = doc.defaultView;
    const scrollEl = parentView.scrollDOM;

    const refreshFromPointer = () => {
      const sess = dragSessionRef.current;
      if (!sess) {
        return;
      }
      const {x, y} = lastPointerRef.current;
      if (sess.kind === 'col') {
        const rects = measureColumnRects();
        if (rects.length === 0) {
          return;
        }
        const drop = pickColumnDropIndex(x, rects);
        const bar = columnDropBarViewport(rects, drop);
        if (bar) {
          setDropLine(bar);
        }
      } else {
        const rects = measureBodyRowRects();
        if (rects.length === 0) {
          return;
        }
        const drop = pickRowDropIndex(y, rects);
        const bar = rowDropBarViewport(rects, drop);
        if (bar) {
          setDropLine(bar);
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = {x: e.clientX, y: e.clientY};
      refreshFromPointer();
    };

    const endDrag = () => {
      const sess = dragSessionRef.current;
      dragSessionRef.current = null;
      setIsDraggingTable(false);
      setDropLine(null);
      doc.body.style.userSelect = '';
      if (!sess) {
        return;
      }
      const merged = snapshotAllCellDocs();
      if (sess.kind === 'col') {
        const n = merged[0]?.length ?? 0;
        if (n === 0) {
          return;
        }
        const rects = measureColumnRects();
        if (rects.length === 0) {
          return;
        }
        const drop = pickColumnDropIndex(lastPointerRef.current.x, rects);
        const perm = columnReorderPermutation(n, sess.source, drop);
        if (perm && !isIdentityPermutation(perm)) {
          const alignNow = [...draftRef.current.align];
          const {cells: nc, align: na} = applyColumnPermutation(
            merged.map(r => [...r]),
            alignNow,
            perm,
          );
          draftRef.current.cells = nc.map(r => [...r]);
          draftRef.current.align = [...na];
          setCells(nc.map(r => [...r]));
          setAlign(na);
          const {row, col} = activeCellRef.current;
          activeCellRef.current = {row, col: perm.indexOf(col)};
        }
      } else {
        const m = merged.length - 1;
        const rects = measureBodyRowRects();
        if (rects.length === 0) {
          return;
        }
        const drop = pickRowDropIndex(lastPointerRef.current.y, rects);
        const perm = bodyRowReorderPermutation(m, sess.source, drop);
        if (perm && !isIdentityPermutation(perm)) {
          const next = moveBodyRowBefore(merged, sess.source, drop);
          if (next) {
            draftRef.current.cells = next.map(r => [...r]);
            setCells(next.map(r => [...r]));
            const {row, col} = activeCellRef.current;
            const oldB = row - 1;
            if (oldB >= 0) {
              activeCellRef.current = {
                row: perm.indexOf(oldB) + 1,
                col,
              };
            }
          }
        }
      }
      parentView.requestMeasure();
      requestAnimationFrame(() => {
        const {row, col} = activeCellRef.current;
        cellEditorsRef.current.get(cellKey(row, col))?.focus();
      });
    };

    doc.body.style.userSelect = 'none';
    refreshFromPointer();
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', endDrag);
    doc.addEventListener('pointercancel', endDrag);
    scrollEl.addEventListener('scroll', refreshFromPointer, true);
    win?.addEventListener('resize', refreshFromPointer);
    return () => {
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', endDrag);
      doc.removeEventListener('pointercancel', endDrag);
      scrollEl.removeEventListener('scroll', refreshFromPointer, true);
      win?.removeEventListener('resize', refreshFromPointer);
    };
  }, [
    isDraggingTable,
    measureBodyRowRects,
    measureColumnRects,
    parentView,
    snapshotAllCellDocs,
  ]);

  const headerRow = cells[0];
  const bodyRows = cells.slice(1);
  const visibleBodyRowCount = Math.min(hydratedBodyRowCount, bodyRowCount);

  const menuIcon = (name: string) => (
    <span className="material-icons eskerra-table-handle-menu__glyph" aria-hidden>
      {name}
    </span>
  );

  const renderColumnHandle = (ci: number): ReactNode => {
    const n = colCount;
    const run = (patch: () => void) => {
      patch();
      parentView.requestMeasure();
    };
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="cm-eskerra-table-shell__col-handle"
            role="presentation"
            onPointerDown={e => {
              if (e.button !== 0) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              lastPointerRef.current = {x: e.clientX, y: e.clientY};
              dragSessionRef.current = {kind: 'col', source: ci};
              setIsDraggingTable(true);
            }}
          >
            <span
              className="material-icons cm-eskerra-table-shell__handle-icon cm-eskerra-table-shell__handle-icon--col"
              aria-hidden
            >
              drag_indicator
            </span>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="eskerra-table-handle-menu"
            alignOffset={2}
            collisionPadding={8}
          >
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const sorted = sortBodyByColumn(merged, ci, 'asc');
                  if (sorted) {
                    draftRef.current.cells = sorted.map(r => [...r]);
                    setCells(sorted.map(r => [...r]));
                  }
                });
              }}
            >
              {menuIcon('sort_by_alpha')}
              Sort by column (A to Z)
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const sorted = sortBodyByColumn(merged, ci, 'desc');
                  if (sorted) {
                    draftRef.current.cells = sorted.map(r => [...r]);
                    setCells(sorted.map(r => [...r]));
                  }
                });
              }}
            >
              {menuIcon('sort_by_alpha')}
              Sort by column (Z to A)
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = insertColumnAt(merged, align, ci);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                  }
                });
              }}
            >
              {menuIcon('keyboard_arrow_left')}
              Add column to the left
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = insertColumnAt(merged, align, ci + 1);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                  }
                });
              }}
            >
              {menuIcon('keyboard_arrow_right')}
              Add column to the right
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              disabled={ci <= 0}
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = moveColumnStep(merged, align, ci, -1);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                    const {row, col} = activeCellRef.current;
                    if (col === ci) {
                      activeCellRef.current = {row, col: col - 1};
                    }
                  }
                });
              }}
            >
              {menuIcon('arrow_back')}
              Move column left
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              disabled={ci >= n - 1}
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = moveColumnStep(merged, align, ci, 1);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                    const {row, col} = activeCellRef.current;
                    if (col === ci) {
                      activeCellRef.current = {row, col: col + 1};
                    }
                  }
                });
              }}
            >
              {menuIcon('arrow_forward')}
              Move column right
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const na = setColumnAlignment(align, ci, 'left');
                  if (na) {
                    draftRef.current.align = na;
                    setAlign(na);
                  }
                });
              }}
            >
              {menuIcon('format_align_left')}
              Align left
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const na = setColumnAlignment(align, ci, 'center');
                  if (na) {
                    draftRef.current.align = na;
                    setAlign(na);
                  }
                });
              }}
            >
              {menuIcon('format_align_center')}
              Align center
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const na = setColumnAlignment(align, ci, 'right');
                  if (na) {
                    draftRef.current.align = na;
                    setAlign(na);
                  }
                });
              }}
            >
              {menuIcon('format_align_right')}
              Align right
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = duplicateColumnAt(merged, align, ci);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                  }
                });
              }}
            >
              {menuIcon('content_copy')}
              Duplicate column
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item eskerra-table-handle-menu__item--danger"
              disabled={n <= 1}
              onSelect={() => {
                run(() => {
                  const merged = snapshotAllCellDocs();
                  const out = removeColumnAt(merged, align, ci);
                  if (out) {
                    draftRef.current.cells = out.cells.map(r => [...r]);
                    draftRef.current.align = [...out.align];
                    setCells(out.cells.map(r => [...r]));
                    setAlign(out.align);
                    const {row, col} = activeCellRef.current;
                    const nextCol = Math.min(
                      col >= ci ? Math.max(0, col - 1) : col,
                      out.cells[0]!.length - 1,
                    );
                    activeCellRef.current = {row, col: nextCol};
                  }
                });
              }}
            >
              {menuIcon('delete')}
              Delete column
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  };

  const renderRowHandle = (bodyIndex: number): ReactNode => {
    const nBody = bodyRows.length;
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="cm-eskerra-table-shell__row-handle"
            role="presentation"
            onPointerDown={e => {
              if (e.button !== 0) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              lastPointerRef.current = {x: e.clientX, y: e.clientY};
              dragSessionRef.current = {kind: 'row', source: bodyIndex};
              setIsDraggingTable(true);
            }}
          >
            <span
              className="material-icons cm-eskerra-table-shell__handle-icon"
              aria-hidden
            >
              drag_indicator
            </span>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="eskerra-table-handle-menu"
            alignOffset={2}
            collisionPadding={8}
          >
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = insertBodyRowAt(merged, bodyIndex);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('keyboard_arrow_up')}
              Add row above
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = insertBodyRowAt(merged, bodyIndex + 1);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('keyboard_arrow_down')}
              Add row below
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              disabled={bodyIndex <= 0}
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = moveBodyRowStep(merged, bodyIndex, -1);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                  const {row, col} = activeCellRef.current;
                  if (row === bodyIndex + 1) {
                    activeCellRef.current = {row: row - 1, col};
                  }
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('arrow_upward')}
              Move row up
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              disabled={bodyIndex >= nBody - 1}
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = moveBodyRowStep(merged, bodyIndex, 1);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                  const {row, col} = activeCellRef.current;
                  if (row === bodyIndex + 1) {
                    activeCellRef.current = {row: row + 1, col};
                  }
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('arrow_downward')}
              Move row down
            </ContextMenu.Item>
            <ContextMenu.Separator className="eskerra-table-handle-menu__sep" />
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item"
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = duplicateBodyRowAt(merged, bodyIndex);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('content_copy')}
              Duplicate row
            </ContextMenu.Item>
            <ContextMenu.Item
              className="eskerra-table-handle-menu__item eskerra-table-handle-menu__item--danger"
              onSelect={() => {
                const merged = snapshotAllCellDocs();
                const next = deleteBodyRowAt(merged, bodyIndex);
                if (next) {
                  draftRef.current.cells = next.map(r => [...r]);
                  setCells(next.map(r => [...r]));
                  const {row, col} = activeCellRef.current;
                  if (row === bodyIndex + 1) {
                    activeCellRef.current = {
                      row: Math.max(1, row - 1),
                      col,
                    };
                  } else if (row > bodyIndex + 1) {
                    activeCellRef.current = {row: row - 1, col};
                  }
                }
                parentView.requestMeasure();
              }}
            >
              {menuIcon('delete')}
              Delete row
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  };

  return (
    <div
      ref={shellRef}
      className={
        isDraggingTable
          ? 'cm-eskerra-table-shell cm-eskerra-table-shell--dragging'
          : 'cm-eskerra-table-shell'
      }
    >
      {notice ? (
        <div className="cm-eskerra-table__notice" role="status">
          {notice}
        </div>
      ) : null}

      {dropLine ? (
        <div
          className="cm-eskerra-table-shell__drop-bar"
          style={{
            position: 'fixed',
            left: dropLine.left,
            top: dropLine.top,
            width: dropLine.width,
            height: dropLine.height,
            zIndex: 50,
            pointerEvents: 'none',
          }}
          aria-hidden
        />
      ) : null}

      <div ref={sheetRef} className="cm-eskerra-table-shell__sheet">
        <div
          className="cm-eskerra-table__rail cm-eskerra-table-shell__rail cm-eskerra-table-shell__rail-left"
          aria-label="Row drag handles"
        >
          {bodyRows.map((_, ri) => {
            const g = rowHandleGeom[ri];
            if (g == null) {
              return null;
            }
            return (
              <div
                key={`lr-${ri}`}
                className={
                  hoveredBodyRow === ri
                    ? 'cm-eskerra-table-shell__row-handle-slot cm-eskerra-table-shell__row-handle-slot--lit'
                    : 'cm-eskerra-table-shell__row-handle-slot'
                }
                data-eskerra-row-hover={ri}
                style={{
                  top: g.top,
                  height: Math.max(g.height, 12),
                }}
                onMouseEnter={() => setHoveredBodyRow(ri)}
                onMouseLeave={e => leaveRowHover(ri, e)}
              >
                {renderRowHandle(ri)}
              </div>
            );
          })}
        </div>

        <table
          className={
            isDraggingTable
              ? 'cm-eskerra-table-shell__table cm-eskerra-table__table cm-eskerra-table-shell__table--dragging'
              : 'cm-eskerra-table-shell__table cm-eskerra-table__table'
          }
        >
          <thead>
            <tr>
              {headerRow?.map((text, ci) => (
                <EskerraShellCell
                  key={`h-${ci}`}
                  row={0}
                  col={ci}
                  cellText={text}
                  isHeader
                  headerColIndex={ci}
                  prepend={renderColumnHandle(ci)}
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
            {bodyRows.slice(0, visibleBodyRowCount).map((row, ri) => (
              <tr
                key={`br-${ri}`}
                className="cm-eskerra-table-shell__body-row"
                data-eskerra-body-row={ri}
                data-eskerra-row-hover={ri}
                onMouseEnter={() => setHoveredBodyRow(ri)}
                onMouseLeave={e => leaveRowHover(ri, e)}
              >
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
          </div>
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
  headerColIndex?: number;
  prepend?: ReactNode;
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
    headerColIndex,
    prepend,
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

  useEffect(() => {
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
  const thProps =
    headerColIndex !== undefined
      ? {'data-eskerra-col-header': String(headerColIndex)}
      : {};
  return (
    <CellTag
      className={
        isHeader
          ? 'cm-eskerra-table-shell__cell cm-eskerra-table-shell__th'
          : 'cm-eskerra-table-shell__cell'
      }
      style={{textAlign: ta}}
      {...thProps}
    >
      {prepend}
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
