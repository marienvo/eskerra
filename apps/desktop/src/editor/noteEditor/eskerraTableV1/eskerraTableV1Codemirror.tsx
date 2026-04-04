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
import {createRoot, type Root} from 'react-dom/client';

import {EskerraTableEditDataGrid} from './EskerraTableEditDataGrid';

const tableEditReactRoots = new WeakMap<HTMLElement, Root>();

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
    wrap.className = 'cm-eskerra-table-raw-banner cm-eskerra-table__actions';

    const tableFrom = this.headerLineFrom;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className =
      'cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger';
    editButton.setAttribute('data-tooltip', 'Edit table');
    editButton.setAttribute('aria-label', 'Edit table');
    appendMaterialIcon(editButton, 'edit');
    editButton.addEventListener('click', e => {
      e.preventDefault();
      view.dispatch({
        effects: [
          clearTableSuppressionAt.of({lineFrom: tableFrom}),
          enterTableEdit.of({from: tableFrom}),
        ],
      });
      view.focus();
    });

    const showRenderedBtn = document.createElement('button');
    showRenderedBtn.type = 'button';
    showRenderedBtn.className = 'cm-eskerra-table__icon-btn app-tooltip-trigger';
    showRenderedBtn.setAttribute('data-tooltip', 'Show rendered table');
    showRenderedBtn.setAttribute('aria-label', 'Show rendered table');
    appendMaterialIcon(showRenderedBtn, 'code_off');
    showRenderedBtn.addEventListener('click', e => {
      e.preventDefault();
      view.dispatch({
        effects: clearTableSuppressionAt.of({lineFrom: tableFrom}),
      });
      view.focus();
    });

    wrap.append(editButton, showRenderedBtn);
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
    return this.mode === 'cells' ? 320 : 180;
  }

  destroy(dom: HTMLElement): void {
    if (this.mode !== 'cells') {
      return;
    }
    const root = tableEditReactRoots.get(dom);
    if (root) {
      root.unmount();
      tableEditReactRoots.delete(dom);
    }
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
    const host = document.createElement('div');
    host.className = 'cm-eskerra-table cm-eskerra-table--cells';
    const align = [...this.block.model.align];
    const reactRoot = createRoot(host);
    tableEditReactRoots.set(host, reactRoot);
    reactRoot.render(
      <EskerraTableEditDataGrid
        initialModel={this.block.model}
        onDiscard={() => {
          view.dispatch({effects: exitTableEdit.of(null)});
        }}
        onLeaveMarkdown={() => {
          this.leaveAsMarkdown(view);
        }}
        onCommit={(cells, moveBelow) => {
          this.commitDraft(view, cells, align, moveBelow);
        }}
      />,
    );
    return host;
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
    editButton.className =
      'cm-eskerra-table__icon-btn cm-eskerra-table__icon-btn--primary app-tooltip-trigger';
    editButton.setAttribute('data-tooltip', 'Edit table');
    editButton.setAttribute('aria-label', 'Edit table');
    appendMaterialIcon(editButton, 'edit');
    editButton.addEventListener('click', event => {
      event.preventDefault();
      view.dispatch({
        effects: enterTableEdit.of({from: this.block.from}),
      });
      view.focus();
    });

    const markdownButton = document.createElement('button');
    markdownButton.type = 'button';
    markdownButton.className = 'cm-eskerra-table__icon-btn app-tooltip-trigger';
    markdownButton.setAttribute('data-tooltip', 'Edit as Markdown');
    markdownButton.setAttribute('aria-label', 'Edit as Markdown');
    appendMaterialIcon(markdownButton, 'code');
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
