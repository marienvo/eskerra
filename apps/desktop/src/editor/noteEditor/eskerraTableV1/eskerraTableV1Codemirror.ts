import {
  type EskerraTableModelV1,
  parseEskerraTableV1FromLines,
  serializeEskerraTableV1ToMarkdown,
} from '@notebox/core';
import {
  RangeSet,
  RangeSetBuilder,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  type DecorationSet,
  WidgetType,
} from '@codemirror/view';

class TableAtomicSpan extends RangeValue {
  static readonly instance = new TableAtomicSpan();

  eq(other: RangeValue): boolean {
    return other instanceof TableAtomicSpan;
  }
}

type TableBlock = {
  from: number;
  to: number;
  lineFrom: number;
  model: EskerraTableModelV1;
};

type BuildResult = {
  decorations: DecorationSet;
  atomic: RangeSet<TableAtomicSpan>;
};

const enterTableEdit = StateEffect.define<{from: number}>();
const exitTableEdit = StateEffect.define();
const suppressTableWidgetAt = StateEffect.define<{lineFrom: number}>();
/** Clears suppression for one table (header line `from`). */
const clearTableSuppressionAt = StateEffect.define<{lineFrom: number}>();

const editingTableFrom = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged) {
      return null;
    }
    for (const effect of tr.effects) {
      if (effect.is(enterTableEdit)) {
        return effect.value.from;
      }
      if (effect.is(exitTableEdit)) {
        return null;
      }
    }
    return value;
  },
});

function looksLikeDelimitedTableLine(text: string): boolean {
  return text.startsWith('|') && text.endsWith('|');
}

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

function tableRangeTo(viewDoc: Text, lineTo: number): number {
  if (lineTo < viewDoc.length && viewDoc.sliceString(lineTo, lineTo + 1) === '\n') {
    return lineTo + 1;
  }
  return lineTo;
}

function findTableBlocks(doc: Text): TableBlock[] {
  const out: TableBlock[] = [];
  let lineNumber = 1;
  while (lineNumber <= doc.lines) {
    const startLine = doc.line(lineNumber);
    if (!looksLikeDelimitedTableLine(startLine.text)) {
      lineNumber += 1;
      continue;
    }

    const lines: string[] = [];
    let endLineNumber = lineNumber;
    while (endLineNumber <= doc.lines) {
      const line = doc.line(endLineNumber);
      if (line.text.trim() === '' || !looksLikeDelimitedTableLine(line.text)) {
        break;
      }
      lines.push(line.text);
      endLineNumber += 1;
    }

    const parsed = parseEskerraTableV1FromLines(lines);
    if (parsed.ok) {
      const endLine = doc.line(endLineNumber - 1);
      out.push({
        from: startLine.from,
        to: tableRangeTo(doc, endLine.to),
        lineFrom: startLine.from,
        model: parsed.model,
      });
      lineNumber = endLineNumber;
      continue;
    }

    lineNumber = endLineNumber;
  }
  return out;
}

function matrixFromTsv(plain: string): string[][] {
  const normalized = plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = normalized.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') {
    rows.pop();
  }
  return rows
    .map(row => row.split('\t'))
    .filter(row => row.length > 0 && (row.length !== 1 || row[0] !== ''));
}

function matrixFromHtmlTable(html: string): string[][] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) {
    return [];
  }
  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach(row => {
    const cells = Array.from(row.querySelectorAll('th,td')).map(cell =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    if (cells.length > 0) {
      rows.push(cells);
    }
  });
  return rows;
}

function clipboardMatrix(event: ClipboardEvent): string[][] {
  const dt = event.clipboardData;
  if (!dt) {
    return [];
  }
  const html = dt.getData('text/html');
  if (html.trim() !== '') {
    const fromHtml = matrixFromHtmlTable(html);
    if (fromHtml.length > 0) {
      return fromHtml;
    }
  }
  const plain = dt.getData('text/plain');
  if (plain.trim() === '') {
    return [];
  }
  return matrixFromTsv(plain);
}

function defaultAlignmentForWidth(width: number): EskerraTableModelV1['align'] {
  return Array.from({length: width}, () => undefined);
}

/** Inline exit strip directly above a suppressed raw Markdown table (document order, not editor-global). */
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
    return 44;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-eskerra-table-raw-banner';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Table shown as Markdown source');

    const text = document.createElement('span');
    text.className = 'cm-eskerra-table-raw-banner__text';
    text.textContent = 'This table is shown as Markdown source. ';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-eskerra-table-raw-banner__button';
    btn.textContent = 'Show rendered table';
    btn.addEventListener('click', e => {
      e.preventDefault();
      view.dispatch({
        effects: clearTableSuppressionAt.of({lineFrom: this.headerLineFrom}),
      });
      view.focus();
    });

    wrap.append(text, btn);
    return wrap;
  }
}

class EskerraTableWidget extends WidgetType {
  private readonly block: TableBlock;
  private readonly mode: 'render' | 'cells';

  constructor(block: TableBlock, mode: 'render' | 'cells') {
    super();
    this.block = block;
    this.mode = mode;
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof EskerraTableWidget)) {
      return false;
    }
    return (
      other.mode === this.mode
      && other.block.from === this.block.from
      && other.block.to === this.block.to
      && JSON.stringify(other.block.model) === JSON.stringify(this.block.model)
    );
  }

  get estimatedHeight(): number {
    return this.mode === 'cells' ? 240 : 180;
  }

  private renderTableFromModel(model: EskerraTableModelV1): HTMLTableElement {
    const table = document.createElement('table');
    table.className = 'cm-eskerra-table__table';
    const [headerRow, ...bodyRows] = model.cells;
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const cell of headerRow ?? []) {
      const th = document.createElement('th');
      th.textContent = cell;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    if (bodyRows.length > 0) {
      const tbody = document.createElement('tbody');
      for (const row of bodyRows) {
        const bodyTr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.textContent = cell;
          bodyTr.appendChild(td);
        }
        tbody.appendChild(bodyTr);
      }
      table.appendChild(tbody);
    }
    return table;
  }

  private commitDraft(
    view: EditorView,
    draft: string[][],
    align: EskerraTableModelV1['align'],
    moveCursorBelow: boolean,
  ) {
    const model: EskerraTableModelV1 = {
      cells: draft,
      align: align.length > 0 ? align : defaultAlignmentForWidth(draft[0]?.length ?? 0),
    };
    const markdown = serializeEskerraTableV1ToMarkdown(model);
    const current = view.state.doc.sliceString(this.block.from, this.block.to);
    let insert = markdown;
    if (!moveCursorBelow && current === insert) {
      view.dispatch({effects: exitTableEdit.of(null)});
      return;
    }

    let selectionHead: number | null = null;
    if (moveCursorBelow) {
      const oldTailChar = view.state.doc.sliceString(this.block.to, this.block.to + 1);
      selectionHead = this.block.from + insert.length;
      if (this.block.to >= view.state.doc.length || oldTailChar !== '\n') {
        insert += '\n';
        selectionHead += 1;
      }
    }

    view.dispatch({
      changes: {
        from: this.block.from,
        to: this.block.to,
        insert,
      },
      effects: exitTableEdit.of(null),
      selection: selectionHead == null
        ? undefined
        : {anchor: selectionHead},
      scrollIntoView: true,
    });
  }

  private leaveAsMarkdown(view: EditorView) {
    view.dispatch({
      effects: [
        exitTableEdit.of(null),
        suppressTableWidgetAt.of({lineFrom: this.block.lineFrom}),
      ],
      selection: {anchor: this.block.lineFrom},
      scrollIntoView: true,
    });
    view.focus();
  }

  private renderCells(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-eskerra-table cm-eskerra-table--cells';

    const actions = document.createElement('div');
    actions.className = 'cm-eskerra-table__actions';

    const addRowButton = document.createElement('button');
    addRowButton.type = 'button';
    addRowButton.className = 'cm-eskerra-table__button';
    addRowButton.textContent = 'Add row';

    const markdownButton = document.createElement('button');
    markdownButton.type = 'button';
    markdownButton.className = 'cm-eskerra-table__button';
    markdownButton.textContent = 'Edit as Markdown';

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'cm-eskerra-table__button cm-eskerra-table__button--primary';
    doneButton.textContent = 'Done';

    actions.append(addRowButton, markdownButton, doneButton);
    root.appendChild(actions);

    const notice = document.createElement('p');
    notice.className = 'cm-eskerra-table__notice';
    notice.hidden = true;
    root.appendChild(notice);

    const table = document.createElement('table');
    table.className = 'cm-eskerra-table__table';
    root.appendChild(table);

    const draft = this.block.model.cells.map(row => [...row]);
    const align = [...this.block.model.align];
    let dirty = false;
    let lastFocusRow = 0;
    let lastFocusCol = 0;
    const inputs: HTMLInputElement[][] = [];

    const focusCell = (row: number, col: number) => {
      const input = inputs[row]?.[col];
      if (!input) {
        return;
      }
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    const commitFromEditor = (moveCursorBelow: boolean) => {
      this.commitDraft(view, draft, align, moveCursorBelow);
    };

    const renderGrid = () => {
      table.replaceChildren();
      inputs.length = 0;
      const thead = document.createElement('thead');
      const tbody = document.createElement('tbody');

      for (let rowIndex = 0; rowIndex < draft.length; rowIndex += 1) {
        const row = draft[rowIndex]!;
        const tr = document.createElement('tr');
        const rowInputs: HTMLInputElement[] = [];
        for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
          const cellTag = rowIndex === 0 ? 'th' : 'td';
          const cell = document.createElement(cellTag);
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'cm-eskerra-table__input';
          input.value = row[colIndex]!;
          input.setAttribute(
            'aria-label',
            rowIndex === 0
              ? `Header column ${colIndex + 1}`
              : `Row ${rowIndex + 1}, column ${colIndex + 1}`,
          );
          input.addEventListener('focus', () => {
            lastFocusRow = rowIndex;
            lastFocusCol = colIndex;
          });
          input.addEventListener('input', () => {
            draft[rowIndex]![colIndex] = input.value;
            dirty = true;
          });
          input.addEventListener('keydown', event => {
            const rowCount = draft.length;
            const colCount = draft[0]?.length ?? 0;
            if (event.key === 'Escape') {
              event.preventDefault();
              view.dispatch({effects: exitTableEdit.of(null)});
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (rowIndex < rowCount - 1) {
                focusCell(rowIndex + 1, colIndex);
              } else {
                commitFromEditor(true);
              }
              return;
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              const linear = rowIndex * colCount + colIndex;
              const total = rowCount * colCount;
              const next = event.shiftKey
                ? (linear - 1 + total) % total
                : (linear + 1) % total;
              focusCell(Math.floor(next / colCount), next % colCount);
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              commitFromEditor(false);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              focusCell(Math.max(0, rowIndex - 1), colIndex);
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              focusCell(Math.min(rowCount - 1, rowIndex + 1), colIndex);
              return;
            }
          });
          input.addEventListener('paste', event => {
            const matrix = clipboardMatrix(event);
            if (matrix.length === 0) {
              return;
            }
            event.preventDefault();
            const sourceRows = matrix.length;
            const sourceCols = Math.max(...matrix.map(row => row.length), 0);
            const rowCap = draft.length - rowIndex;
            const colCap = (draft[0]?.length ?? 0) - colIndex;
            const appliedRows = Math.max(0, Math.min(sourceRows, rowCap));
            const appliedCols = Math.max(0, Math.min(sourceCols, colCap));
            for (let r = 0; r < appliedRows; r += 1) {
              for (let c = 0; c < appliedCols; c += 1) {
                const value = matrix[r]?.[c] ?? '';
                draft[rowIndex + r]![colIndex + c] = value;
                const target = inputs[rowIndex + r]?.[colIndex + c];
                if (target) {
                  target.value = value;
                }
              }
            }
            dirty = true;
            if (appliedRows < sourceRows || appliedCols < sourceCols) {
              notice.hidden = false;
              notice.textContent = `Pasted ${appliedRows}×${appliedCols} of ${sourceRows}×${sourceCols}`;
            } else {
              notice.hidden = true;
            }
          });

          cell.appendChild(input);
          tr.appendChild(cell);
          rowInputs.push(input);
        }
        inputs.push(rowInputs);
        if (rowIndex === 0) {
          thead.appendChild(tr);
        } else {
          tbody.appendChild(tr);
        }
      }

      table.appendChild(thead);
      if (draft.length > 1) {
        table.appendChild(tbody);
      }
    };

    renderGrid();

    addRowButton.addEventListener('click', event => {
      event.preventDefault();
      const width = draft[0]?.length ?? 0;
      draft.push(Array.from({length: width}, () => ''));
      dirty = true;
      renderGrid();
      focusCell(draft.length - 1, 0);
    });

    markdownButton.addEventListener('click', event => {
      event.preventDefault();
      this.leaveAsMarkdown(view);
    });

    doneButton.addEventListener('click', event => {
      event.preventDefault();
      if (dirty) {
        commitFromEditor(false);
      } else {
        view.dispatch({effects: exitTableEdit.of(null)});
      }
    });

    root.addEventListener('focusout', () => {
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active)) {
          return;
        }
        focusCell(lastFocusRow, lastFocusCol);
      });
    });

    queueMicrotask(() => {
      focusCell(lastFocusRow, lastFocusCol);
    });

    return root;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    if (this.mode === 'cells') {
      return this.renderCells(view);
    }

    root.className = 'cm-eskerra-table cm-eskerra-table--render';
    const actions = document.createElement('div');
    actions.className = 'cm-eskerra-table__actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'cm-eskerra-table__button cm-eskerra-table__button--primary';
    editButton.textContent = 'Edit table';
    editButton.addEventListener('click', event => {
      event.preventDefault();
      view.dispatch({
        effects: enterTableEdit.of({from: this.block.from}),
      });
      view.focus();
    });

    const markdownButton = document.createElement('button');
    markdownButton.type = 'button';
    markdownButton.className = 'cm-eskerra-table__button';
    markdownButton.textContent = 'Edit as Markdown';
    markdownButton.addEventListener('click', event => {
      event.preventDefault();
      this.leaveAsMarkdown(view);
    });

    actions.append(editButton, markdownButton);
    root.appendChild(actions);
    root.appendChild(this.renderTableFromModel(this.block.model));
    return root;
  }
}

function buildDecorations(state: EditorState): BuildResult {
  const editingFrom = state.field(editingTableFrom);
  const suppressed = state.field(suppressedTableLines);
  const blocks = findTableBlocks(state.doc);
  const decoBuilder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<TableAtomicSpan>();

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
    const mode = editingFrom === block.from ? 'cells' : 'render';
    decoBuilder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new EskerraTableWidget(block, mode),
        block: true,
      }),
    );
    if (mode === 'render') {
      atomicBuilder.add(block.from, block.to, TableAtomicSpan.instance);
    }
  }

  return {
    decorations: decoBuilder.finish(),
    atomic: atomicBuilder.finish(),
  };
}

function transactionAffectsTables(tr: Transaction): boolean {
  return (
    tr.docChanged
    || tr.effects.some(effect =>
      effect.is(enterTableEdit)
      || effect.is(exitTableEdit)
      || effect.is(suppressTableWidgetAt)
      || effect.is(clearTableSuppressionAt))
  );
}

const tableBuilt = StateField.define<BuildResult>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (!transactionAffectsTables(tr)) {
      return value;
    }
    return buildDecorations(tr.state);
  },
  provide: self => [
    EditorView.decorations.from(self, built => built.decorations),
    EditorView.atomicRanges.of(view => view.state.field(self).atomic),
  ],
});

export function eskerraTableV1Extension(): readonly Extension[] {
  return [
    editingTableFrom,
    suppressedTableLines,
    tableBuilt,
  ];
}
