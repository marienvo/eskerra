import {
  type EskerraTableModelV1,
  parseEskerraTableV1FromLines,
  serializeEskerraTableV1ToMarkdown,
} from '@notebox/core';
import {
  EditorSelection,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  type DecorationSet,
  WidgetType,
  keymap,
} from '@codemirror/view';

import {
  buildEskerraTableCellMappings,
  findCellMappingAtPos,
  findCellMappingByLogicalCoords,
  eskerraTableLogicalRowCount,
} from './eskerraTableCellMap';
import {clipboardMatrixFromClipboardEvent} from './eskerraTableClipboard';
import {
  buildEskerraTableInsertWithBlankLines,
  findEskerraTableDocBlockByLineFrom,
  findEskerraTableDocBlocks,
  looksLikeDelimitedTableLine,
  type EskerraTableDocBlock,
} from './eskerraTableV1DocBlocks';

type TableEditMode = {
  headerLineFrom: number;
  baselineText: string;
};

type BuildResult = {
  decorations: DecorationSet;
};

const suppressTableWidgetAt = StateEffect.define<{lineFrom: number}>();
const clearTableSuppressionAt = StateEffect.define<{lineFrom: number}>();

const enterTableModeEffect = StateEffect.define<TableEditMode>();
const exitTableModeEffect = StateEffect.define<null>();

const suppressedTableLines = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, tr) {
    let next: Set<number>;
    if (tr.docChanged) {
      next = new Set();
      for (const pos of value) {
        const mapped = tr.changes.mapPos(pos, -1);
        if (mapped === null) {
          continue;
        }
        try {
          const line = tr.state.doc.lineAt(mapped);
          if (!looksLikeDelimitedTableLine(line.text)) {
            continue;
          }
          next.add(line.from);
        } catch {
          /* line no longer exists */
        }
      }
    } else {
      next = new Set(value);
    }

    for (const effect of tr.effects) {
      if (effect.is(suppressTableWidgetAt)) {
        next.add(effect.value.lineFrom);
      }
      if (effect.is(clearTableSuppressionAt)) {
        next.delete(effect.value.lineFrom);
      }
    }
    return next;
  },
});

const tableEditModeField = StateField.define<TableEditMode | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    if (next && tr.docChanged) {
      const mapped = tr.changes.mapPos(next.headerLineFrom, -1);
      if (mapped === null) {
        next = null;
      } else {
        try {
          const line = tr.state.doc.lineAt(mapped);
          next = {...next, headerLineFrom: line.from};
        } catch {
          next = null;
        }
      }
    }
    for (const effect of tr.effects) {
      if (effect.is(enterTableModeEffect)) {
        next = effect.value;
      }
      if (effect.is(exitTableModeEffect)) {
        next = null;
      }
    }
    if (next) {
      const headerLineFrom = next.headerLineFrom;
      const suppressed = tr.state.field(suppressedTableLines);
      if (suppressed.has(headerLineFrom)) {
        next = null;
      } else {
        const block = findEskerraTableDocBlocks(tr.state.doc).find(
          b => b.lineFrom === headerLineFrom,
        );
        if (!block) {
          next = null;
        } else {
          const raw = tr.state.doc.sliceString(block.from, block.to).split('\n');
          if (!parseEskerraTableV1FromLines(raw).ok) {
            next = null;
          }
        }
      }
    }
    return next;
  },
});

function defaultAlignmentForWidth(width: number): EskerraTableModelV1['align'] {
  return Array.from({length: width}, () => undefined);
}

function appendMaterialIcon(button: HTMLButtonElement, ligature: string): void {
  const icon = document.createElement('span');
  icon.className = 'material-icons cm-eskerra-table__icon-glyph';
  icon.textContent = ligature;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
}

function createRailSlotSpacer(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'cm-eskerra-table__rail-slot-spacer';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function cursorPosBelowTable(doc: EditorState['doc'], block: Pick<EskerraTableDocBlock, 'to'>): number {
  const lastLineNo = doc.lineAt(block.to).number;
  if (lastLineNo < doc.lines) {
    return doc.line(lastLineNo + 1).from;
  }
  return doc.length;
}

function applyEskerraTableDone(view: EditorView, moveBelow: boolean): void {
  const mode = view.state.field(tableEditModeField);
  if (!mode) {
    return;
  }
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, mode.headerLineFrom);
  if (!block) {
    view.dispatch({effects: exitTableModeEffect.of(null)});
    return;
  }
  const raw = view.state.doc.sliceString(block.from, block.to).split('\n');
  const parsed = parseEskerraTableV1FromLines(raw);
  if (!parsed.ok) {
    view.dispatch({effects: exitTableModeEffect.of(null)});
    return;
  }
  const markdown = serializeEskerraTableV1ToMarkdown(parsed.model);
  const insert = buildEskerraTableInsertWithBlankLines(view.state.doc, block, markdown);
  const current = view.state.doc.sliceString(block.from, block.to);
  const effects = [exitTableModeEffect.of(null)];

  if (insert !== current) {
    const head = moveBelow ? block.from + insert.length : undefined;
    view.dispatch({
      changes: {from: block.from, to: block.to, insert},
      effects,
      selection: head == null ? undefined : EditorSelection.cursor(head),
      scrollIntoView: true,
    });
  } else {
    const head = moveBelow ? cursorPosBelowTable(view.state.doc, block) : undefined;
    view.dispatch({
      effects,
      selection: head == null ? undefined : EditorSelection.cursor(head),
      scrollIntoView: moveBelow,
    });
  }
}

function applyEskerraTableEsc(view: EditorView): void {
  const mode = view.state.field(tableEditModeField);
  if (!mode) {
    return;
  }
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, mode.headerLineFrom);
  if (!block) {
    view.dispatch({effects: exitTableModeEffect.of(null)});
    return;
  }
  view.dispatch({
    changes: {from: block.from, to: block.to, insert: mode.baselineText},
    effects: exitTableModeEffect.of(null),
    scrollIntoView: true,
  });
}

function applyEskerraTableEditAsMarkdown(view: EditorView, headerLineFrom: number): void {
  view.dispatch({
    effects: [
      exitTableModeEffect.of(null),
      suppressTableWidgetAt.of({lineFrom: headerLineFrom}),
    ],
    selection: {anchor: headerLineFrom},
    scrollIntoView: true,
  });
  view.focus();
}

function applyEskerraTableAddRow(view: EditorView, headerLineFrom: number): void {
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, headerLineFrom);
  if (!block) {
    return;
  }
  const raw = view.state.doc.sliceString(block.from, block.to).split('\n');
  const parsed = parseEskerraTableV1FromLines(raw);
  if (!parsed.ok) {
    return;
  }
  const colCount = parsed.model.cells[0]!.length;
  const newRow = Array.from({length: colCount}, () => '');
  const cells = [...parsed.model.cells.map(r => [...r]), newRow];
  const model: EskerraTableModelV1 = {
    cells,
    align: parsed.model.align.length > 0 ? parsed.model.align : defaultAlignmentForWidth(colCount),
  };
  const markdown = serializeEskerraTableV1ToMarkdown(model);
  const insert = buildEskerraTableInsertWithBlankLines(view.state.doc, block, markdown);
  view.dispatch({
    changes: {from: block.from, to: block.to, insert},
    scrollIntoView: true,
  });
}

function applyMatrixPaste(
  view: EditorView,
  headerLineFrom: number,
  matrix: string[][],
): void {
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, headerLineFrom);
  if (!block) {
    return;
  }
  const raw = view.state.doc.sliceString(block.from, block.to).split('\n');
  const parsed = parseEskerraTableV1FromLines(raw);
  if (!parsed.ok) {
    return;
  }
  const rowCount = parsed.model.cells.length;
  const colCount = parsed.model.cells[0]!.length;
  const maps = buildEskerraTableCellMappings(view.state.doc, block);
  if (!maps) {
    return;
  }
  const anchor = view.state.selection.main.anchor;
  const cur = findCellMappingAtPos(anchor, maps);
  if (!cur) {
    return;
  }
  const cells = parsed.model.cells.map(r => [...r]);
  for (let dr = 0; dr < matrix.length; dr += 1) {
    const row = matrix[dr]!;
    for (let dc = 0; dc < row.length; dc += 1) {
      const r = cur.logicalRow + dr;
      const c = cur.col + dc;
      if (r >= rowCount || c >= colCount) {
        continue;
      }
      const v = row[dc] ?? '';
      if (v.includes('|') || v.includes('\n') || v.includes('\r')) {
        continue;
      }
      cells[r]![c] = v;
    }
  }
  const model: EskerraTableModelV1 = {
    cells,
    align: parsed.model.align.length > 0 ? parsed.model.align : defaultAlignmentForWidth(colCount),
  };
  const markdown = serializeEskerraTableV1ToMarkdown(model);
  const insert = buildEskerraTableInsertWithBlankLines(view.state.doc, block, markdown);
  view.dispatch({
    changes: {from: block.from, to: block.to, insert},
    scrollIntoView: true,
  });
}

function findBlockContaining(
  doc: EditorState['doc'],
  pos: number,
  suppressed: Set<number>,
): EskerraTableDocBlock | null {
  for (const block of findEskerraTableDocBlocks(doc)) {
    if (pos >= block.from && pos <= block.to && !suppressed.has(block.lineFrom)) {
      return block;
    }
  }
  return null;
}

class TableRawMarkdownExitWidget extends WidgetType {
  private readonly headerLineFrom: number;

  constructor(headerLineFrom: number) {
    super();
    this.headerLineFrom = headerLineFrom;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableRawMarkdownExitWidget
      && other.headerLineFrom === this.headerLineFrom
    );
  }

  get estimatedHeight(): number {
    return 0;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-eskerra-table-raw-banner';

    const tableFrom = this.headerLineFrom;

    const showTableBtn = document.createElement('button');
    showTableBtn.type = 'button';
    showTableBtn.className =
      'cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger';
    showTableBtn.setAttribute('data-tooltip', 'Show table');
    showTableBtn.setAttribute('aria-label', 'Show table');
    appendMaterialIcon(showTableBtn, 'code_off');
    showTableBtn.addEventListener('click', e => {
      e.preventDefault();
      const block = findEskerraTableDocBlocks(view.state.doc).find(b => b.lineFrom === tableFrom);
      const effects: StateEffect<unknown>[] = [clearTableSuppressionAt.of({lineFrom: tableFrom})];
      if (block) {
        effects.push(
          enterTableModeEffect.of({
            headerLineFrom: tableFrom,
            baselineText: view.state.doc.sliceString(block.from, block.to),
          }),
        );
      }
      view.dispatch({effects});
      view.focus();
    });

    const railTop = document.createElement('div');
    railTop.className = 'cm-eskerra-table__rail-top';
    railTop.append(showTableBtn, createRailSlotSpacer());
    wrap.appendChild(railTop);
    return wrap;
  }
}

class EskerraTableRailWidget extends WidgetType {
  private readonly headerLineFrom: number;

  constructor(headerLineFrom: number) {
    super();
    this.headerLineFrom = headerLineFrom;
  }

  eq(other: WidgetType): boolean {
    return other instanceof EskerraTableRailWidget && other.headerLineFrom === this.headerLineFrom;
  }

  get estimatedHeight(): number {
    return 0;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-eskerra-table-raw-banner cm-eskerra-table-rail-banner';

    const lineFrom = this.headerLineFrom;

    const editMdBtn = document.createElement('button');
    editMdBtn.type = 'button';
    editMdBtn.className = 'cm-eskerra-table__icon-btn app-tooltip-trigger';
    editMdBtn.setAttribute('data-tooltip', 'Edit as Markdown');
    editMdBtn.setAttribute('aria-label', 'Edit as Markdown');
    appendMaterialIcon(editMdBtn, 'code');
    editMdBtn.addEventListener('click', e => {
      e.preventDefault();
      applyEskerraTableEditAsMarkdown(view, lineFrom);
    });

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'cm-eskerra-table__icon-btn app-tooltip-trigger';
    addRowBtn.setAttribute('data-tooltip', 'Add row');
    addRowBtn.setAttribute('aria-label', 'Add row');
    appendMaterialIcon(addRowBtn, 'add');
    addRowBtn.addEventListener('click', e => {
      e.preventDefault();
      applyEskerraTableAddRow(view, lineFrom);
    });

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className =
      'cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger';
    doneBtn.setAttribute('data-tooltip', 'Done');
    doneBtn.setAttribute('aria-label', 'Done');
    appendMaterialIcon(doneBtn, 'check');
    doneBtn.addEventListener('click', e => {
      e.preventDefault();
      applyEskerraTableDone(view, false);
    });

    const top = document.createElement('div');
    top.className = 'cm-eskerra-table__rail-top';
    top.append(editMdBtn, createRailSlotSpacer());

    const bottom = document.createElement('div');
    bottom.className = 'cm-eskerra-table__rail-bottom';
    bottom.append(addRowBtn, doneBtn);

    wrap.append(top, bottom);
    return wrap;
  }
}

function buildDecorations(state: EditorState): BuildResult {
  const suppressed = state.field(suppressedTableLines);
  const editMode = state.field(tableEditModeField);
  const blocks = findEskerraTableDocBlocks(state.doc);
  const decoBuilder = new RangeSetBuilder<Decoration>();

  for (const block of blocks) {
    if (suppressed.has(block.lineFrom)) {
      decoBuilder.add(
        block.from,
        block.from,
        Decoration.widget({
          widget: new TableRawMarkdownExitWidget(block.lineFrom),
          block: true,
          side: -1,
        }),
      );
      continue;
    }

    const rawLines = state.doc.sliceString(block.from, block.to).split('\n');
    const parsed = parseEskerraTableV1FromLines(rawLines);
    if (!parsed.ok) {
      continue;
    }

    const startLineNo = state.doc.lineAt(block.from).number;
    const endLineNo = state.doc.lineAt(block.to).number;
    for (let ln = startLineNo; ln <= endLineNo; ln += 1) {
      const line = state.doc.line(ln);
      const rel = ln - startLineNo;
      let cls = 'cm-eskerra-table-line';
      if (rel >= 2 && (rel - 2) % 2 === 1) {
        cls += ' cm-eskerra-table-line--alt';
      }
      decoBuilder.add(line.from, line.from, Decoration.line({class: cls}));
    }

    const inMode = editMode?.headerLineFrom === block.lineFrom;
    if (inMode) {
      decoBuilder.add(
        block.from,
        block.from,
        Decoration.widget({
          widget: new EskerraTableRailWidget(block.lineFrom),
          block: true,
          side: -1,
        }),
      );

      const mappings = buildEskerraTableCellMappings(state.doc, block);
      if (mappings) {
        const anchor = state.selection.main.anchor;
        const cell = findCellMappingAtPos(anchor, mappings);
        if (cell && cell.interiorTo > cell.interiorFrom) {
          decoBuilder.add(
            cell.interiorFrom,
            cell.interiorTo,
            Decoration.mark({class: 'cm-eskerra-table-active-cell'}),
          );
        }
      }
    }
  }

  return {decorations: decoBuilder.finish()};
}

function transactionAffectsTableDecorations(tr: Transaction): boolean {
  const selectionChanged = !tr.startState.selection.eq(tr.state.selection);
  return (
    tr.docChanged
    || selectionChanged
    || tr.effects.some(
      effect =>
        effect.is(suppressTableWidgetAt)
        || effect.is(clearTableSuppressionAt)
        || effect.is(enterTableModeEffect)
        || effect.is(exitTableModeEffect),
    )
  );
}

const tableBuilt = StateField.define<BuildResult>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (!transactionAffectsTableDecorations(tr)) {
      return value;
    }
    return buildDecorations(tr.state);
  },
  provide: self => [EditorView.decorations.from(self, built => built.decorations)],
});

function tableCellTab(view: EditorView, dir: 1 | -1): boolean {
  const mode = view.state.field(tableEditModeField);
  if (!mode) {
    return false;
  }
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, mode.headerLineFrom);
  if (!block) {
    return false;
  }
  const maps = buildEskerraTableCellMappings(view.state.doc, block);
  if (!maps) {
    return false;
  }
  const anchor = view.state.selection.main.head;
  const cur = findCellMappingAtPos(anchor, maps);
  if (!cur) {
    return false;
  }
  const nRows = eskerraTableLogicalRowCount(maps);
  const nCols = maps.length / nRows;
  const {logicalRow, col} = cur;
  let nextCol = col + dir;
  let nextRow = logicalRow;
  if (nextCol >= nCols) {
    nextCol = 0;
    nextRow += 1;
  } else if (nextCol < 0) {
    nextCol = nCols - 1;
    nextRow -= 1;
  }
  if (nextRow < 0 || nextRow >= nRows) {
    return true;
  }
  const next = findCellMappingByLogicalCoords(maps, nextRow, nextCol);
  if (!next) {
    return false;
  }
  view.dispatch({
    selection: EditorSelection.cursor(next.interiorFrom),
    scrollIntoView: true,
  });
  return true;
}

function tableCellEnter(view: EditorView): boolean {
  const mode = view.state.field(tableEditModeField);
  if (!mode) {
    return false;
  }
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, mode.headerLineFrom);
  if (!block) {
    return false;
  }
  const maps = buildEskerraTableCellMappings(view.state.doc, block);
  if (!maps) {
    return false;
  }
  const anchor = view.state.selection.main.head;
  const cur = findCellMappingAtPos(anchor, maps);
  if (!cur) {
    return false;
  }
  const nRows = eskerraTableLogicalRowCount(maps);
  if (cur.logicalRow < nRows - 1) {
    const next = findCellMappingByLogicalCoords(maps, cur.logicalRow + 1, cur.col);
    if (!next) {
      return false;
    }
    view.dispatch({
      selection: EditorSelection.cursor(next.interiorFrom),
      scrollIntoView: true,
    });
    return true;
  }
  applyEskerraTableDone(view, true);
  return true;
}

const eskerraTableKeymap = Prec.highest(
  keymap.of([
    {key: 'Tab', run: view => tableCellTab(view, 1)},
    {key: 'Shift-Tab', run: view => tableCellTab(view, -1)},
    {key: 'Enter', run: tableCellEnter},
    {
      key: 'Mod-Enter',
      run: view => {
        if (!view.state.field(tableEditModeField)) {
          return false;
        }
        applyEskerraTableDone(view, false);
        return true;
      },
    },
    {
      key: 'Escape',
      run: view => {
        if (!view.state.field(tableEditModeField)) {
          return false;
        }
        applyEskerraTableEsc(view);
        return true;
      },
    },
  ]),
);

const eskerraTableSelectionBridge = EditorView.updateListener.of(update => {
  if (!update.selectionSet && !update.docChanged) {
    return;
  }
  const st = update.state;
  const anchor = st.selection.main.anchor;
  const suppressed = st.field(suppressedTableLines);
  const blockIn = findBlockContaining(st.doc, anchor, suppressed);
  const mode = st.field(tableEditModeField);
  const startMode = update.startState.field(tableEditModeField);

  if (update.selectionSet && mode) {
    if (!blockIn || blockIn.lineFrom !== mode.headerLineFrom) {
      update.view.dispatch({effects: exitTableModeEffect.of(null)});
    }
  }

  if (!mode && !startMode && blockIn) {
    const raw = st.doc.sliceString(blockIn.from, blockIn.to).split('\n');
    if (parseEskerraTableV1FromLines(raw).ok) {
      update.view.dispatch({
        effects: enterTableModeEffect.of({
          headerLineFrom: blockIn.lineFrom,
          baselineText: st.doc.sliceString(blockIn.from, blockIn.to),
        }),
      });
    }
  }
});

const eskerraTablePasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    const mode = view.state.field(tableEditModeField);
    if (!mode) {
      return false;
    }
    const matrix = clipboardMatrixFromClipboardEvent(event);
    if (matrix.length === 0) {
      return false;
    }
    event.preventDefault();
    applyMatrixPaste(view, mode.headerLineFrom, matrix);
    return true;
  },
});

export function eskerraTableV1Extension(): readonly Extension[] {
  return [
    suppressedTableLines,
    tableEditModeField,
    tableBuilt,
    eskerraTableKeymap,
    eskerraTableSelectionBridge,
    eskerraTablePasteHandler,
  ];
}
