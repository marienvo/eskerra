import {
  type EskerraTableModelV1,
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
import {
  buildEskerraTableInsertWithBlankLines,
  findEskerraTableDocBlocks,
  looksLikeDelimitedTableLine,
  type EskerraTableDocBlock,
} from './eskerraTableV1DocBlocks';

const tableEditReactRoots = new WeakMap<HTMLElement, Root>();

class TableAtomicSpan extends RangeValue {
  static readonly instance = new TableAtomicSpan();

  eq(other: RangeValue): boolean {
    return other instanceof TableAtomicSpan;
  }
}

type BuildResult = {
  decorations: DecorationSet;
  atomic: RangeSet<TableAtomicSpan>;
};

const suppressTableWidgetAt = StateEffect.define<{lineFrom: number}>();
/** Clears suppression for one table (header line `from`). */
const clearTableSuppressionAt = StateEffect.define<{lineFrom: number}>();

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

  /** No vertical gap before the table lines; rail is absolutely positioned beside the first line. */
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
      view.dispatch({
        effects: clearTableSuppressionAt.of({lineFrom: tableFrom}),
      });
      view.focus();
    });

    const railTop = document.createElement('div');
    railTop.className = 'cm-eskerra-table__rail-top';
    railTop.append(showTableBtn, createRailSlotSpacer());
    wrap.appendChild(railTop);
    return wrap;
  }
}

class EskerraTableWidget extends WidgetType {
  private readonly block: EskerraTableDocBlock;

  constructor(block: EskerraTableDocBlock) {
    super();
    this.block = block;
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof EskerraTableWidget)) {
      return false;
    }
    return (
      other.block.from === this.block.from
      && other.block.to === this.block.to
      && JSON.stringify(other.block.model) === JSON.stringify(this.block.model)
    );
  }

  get estimatedHeight(): number {
    const cells = this.block.model.cells;
    const nRows = cells.length;
    let charCount = 0;
    for (const row of cells) {
      for (const cell of row) {
        charCount += cell.length;
      }
    }
    return Math.min(900, 160 + nRows * 56 + Math.floor(charCount / 48));
  }

  destroy(dom: HTMLElement): void {
    const root = tableEditReactRoots.get(dom);
    if (root) {
      root.unmount();
      tableEditReactRoots.delete(dom);
    }
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
    const block = findEskerraTableDocBlocks(view.state.doc).find(
      b => b.lineFrom === this.block.lineFrom,
    );
    if (!block) {
      return;
    }
    const doc = view.state.doc;
    const insert = buildEskerraTableInsertWithBlankLines(doc, block, markdown);
    const current = doc.sliceString(block.from, block.to);
    if (!moveCursorBelow && current === insert) {
      return;
    }

    let selectionHead: number | null = null;
    if (moveCursorBelow) {
      selectionHead = block.from + insert.length;
    }

    view.dispatch({
      changes: {
        from: block.from,
        to: block.to,
        insert,
      },
      selection: selectionHead == null
        ? undefined
        : {anchor: selectionHead},
      scrollIntoView: true,
    });
  }

  private leaveAsMarkdown(view: EditorView) {
    view.dispatch({
      effects: [suppressTableWidgetAt.of({lineFrom: this.block.lineFrom})],
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
        headerLineFrom={this.block.lineFrom}
        initialModel={this.block.model}
        resolveModelFromDoc={() => {
          const doc = view.state.doc;
          return (
            findEskerraTableDocBlocks(doc).find(b => b.lineFrom === this.block.lineFrom)
              ?.model ?? null
          );
        }}
        onLeaveMarkdown={() => {
          this.leaveAsMarkdown(view);
        }}
        onCommit={(cells, moveBelow) => {
          this.commitDraft(view, cells, align, moveBelow);
        }}
        onTableGridLayoutChange={() => {
          view.requestMeasure();
          queueMicrotask(() => {
            view.requestMeasure();
          });
          requestAnimationFrame(() => {
            view.requestMeasure();
          });
        }}
      />,
    );
    return host;
  }

  toDOM(view: EditorView): HTMLElement {
    return this.renderCells(view);
  }
}

function buildDecorations(state: EditorState): BuildResult {
  const suppressed = state.field(suppressedTableLines);
  const blocks = findEskerraTableDocBlocks(state.doc);
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
    decoBuilder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new EskerraTableWidget(block),
        block: true,
      }),
    );
    atomicBuilder.add(block.from, block.to, TableAtomicSpan.instance);
  }

  return {
    decorations: decoBuilder.finish(),
    atomic: atomicBuilder.finish(),
  };
}

function transactionAffectsTables(tr: Transaction): boolean {
  return (
    tr.docChanged
    || tr.effects.some(
      effect => effect.is(suppressTableWidgetAt) || effect.is(clearTableSuppressionAt),
    )
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
  return [suppressedTableLines, tableBuilt];
}
