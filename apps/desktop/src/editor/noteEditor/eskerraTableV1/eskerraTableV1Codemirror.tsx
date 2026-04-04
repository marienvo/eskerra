import {
  parseEskerraTableV1FromLines,
} from '@notebox/core';
import {
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import {createRoot, type Root} from 'react-dom/client';

import {
  findEskerraTableDocBlocks,
  looksLikeDelimitedTableLine,
  type EskerraTableDocBlock,
} from './eskerraTableV1DocBlocks';
import {EskerraTableShell} from './EskerraTableShell';
import {
  clearTableSuppressionAt,
  closeTableShellEffect,
  openTableShellEffect,
  suppressTableWidgetAt,
  type TableShellOpen,
} from './eskerraTableShellEffects';

type BuildResult = {
  decorations: DecorationSet;
};

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

/** Prefer caret table; else first valid non-suppressed table (structured edit is default when present). */
function initialTableShellOpenForState(state: EditorState): TableShellOpen | null {
  const suppressed = state.field(suppressedTableLines);
  const anchor = state.selection.main.anchor;
  const tryBlock = (block: EskerraTableDocBlock | null): TableShellOpen | null => {
    if (!block || suppressed.has(block.lineFrom)) {
      return null;
    }
    const raw = state.doc.sliceString(block.from, block.to).split('\n');
    if (!parseEskerraTableV1FromLines(raw).ok) {
      return null;
    }
    return {
      headerLineFrom: block.lineFrom,
      baselineText: state.doc.sliceString(block.from, block.to),
    };
  };
  const fromCaret = tryBlock(findBlockContaining(state.doc, anchor, suppressed));
  if (fromCaret) {
    return fromCaret;
  }
  for (const block of findEskerraTableDocBlocks(state.doc)) {
    const shell = tryBlock(block);
    if (shell) {
      return shell;
    }
  }
  return null;
}

const tableShellOpenField = StateField.define<TableShellOpen | null>({
  create: initialTableShellOpenForState,
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
      if (effect.is(openTableShellEffect)) {
        next = effect.value;
      }
      if (effect.is(closeTableShellEffect)) {
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

function appendMaterialIcon(button: HTMLButtonElement, ligature: string): void {
  const icon = document.createElement('span');
  icon.className = 'material-icons cm-eskerra-table__icon-glyph';
  icon.textContent = ligature;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
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
      const block = findEskerraTableDocBlocks(view.state.doc).find(
        b => b.lineFrom === tableFrom,
      );
      const openEffects = [
        clearTableSuppressionAt.of({lineFrom: tableFrom}),
        ...(block
          ? [
              openTableShellEffect.of({
                headerLineFrom: tableFrom,
                baselineText: view.state.doc.sliceString(block.from, block.to),
              }),
            ]
          : []),
      ];
      view.dispatch({effects: openEffects});
      scheduleFocusTableCellEditor(view);
    });

    const railTop = document.createElement('div');
    railTop.className = 'cm-eskerra-table__rail-top';
    railTop.append(showTableBtn);
    wrap.appendChild(railTop);
    return wrap;
  }
}

const shellWidgetRoots = new WeakMap<HTMLElement, Root>();

/**
 * Focus the nested cell CodeMirror after the shell React tree mounts (double rAF).
 */
export function scheduleFocusTableCellEditor(hostView: EditorView): void {
  const run = (): void => {
    const root = hostView.dom.querySelector('.cm-eskerra-table-shell-root');
    if (!root) {
      return;
    }
    const content = root.querySelector(
      '.cm-eskerra-table-shell__cm-host[data-eskerra-cell="0,0"] .cm-content',
    );
    if (!(content instanceof HTMLElement)) {
      return;
    }
    const cellEditor = EditorView.findFromDOM(content);
    cellEditor?.focus();
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

class EskerraTableShellWidget extends WidgetType {
  private readonly headerLineFrom: number;
  private readonly baselineText: string;

  constructor(headerLineFrom: number, baselineText: string) {
    super();
    this.headerLineFrom = headerLineFrom;
    this.baselineText = baselineText;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof EskerraTableShellWidget
      && other.headerLineFrom === this.headerLineFrom
      && other.baselineText === this.baselineText
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-eskerra-table-shell-root';
    const headerLineFrom = this.headerLineFrom;
    const promoteIfNeeded = (): void => {
      const st = view.state;
      const open = st.field(tableShellOpenField);
      if (open?.headerLineFrom === headerLineFrom) {
        return;
      }
      const blk = findEskerraTableDocBlocks(st.doc).find(
        b => b.lineFrom === headerLineFrom,
      );
      if (!blk) {
        return;
      }
      const rawLines = st.doc.sliceString(blk.from, blk.to).split('\n');
      if (!parseEskerraTableV1FromLines(rawLines).ok) {
        return;
      }
      view.dispatch({
        effects: openTableShellEffect.of({
          headerLineFrom,
          baselineText: st.doc.sliceString(blk.from, blk.to),
        }),
      });
    };
    wrap.addEventListener('focusin', promoteIfNeeded);
    wrap.addEventListener('pointerdown', promoteIfNeeded);
    const block = findEskerraTableDocBlocks(view.state.doc).find(
      b => b.lineFrom === this.headerLineFrom,
    );
    const raw = block
      ? view.state.doc.sliceString(block.from, block.to).split('\n')
      : [];
    const parsed = parseEskerraTableV1FromLines(raw);
    const model = parsed.ok ? parsed.model : {cells: [[]], align: []};
    const root = createRoot(wrap);
    shellWidgetRoots.set(wrap, root);
    root.render(
      <EskerraTableShell
        parentView={view}
        headerLineFrom={this.headerLineFrom}
        baselineText={this.baselineText}
        initialCells={model.cells}
        initialAlign={model.align}
      />,
    );
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    shellWidgetRoots.get(dom)?.unmount();
    shellWidgetRoots.delete(dom);
  }
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

/** Focus nested cell only when the main selection is inside the open table (not first-table default with caret elsewhere). */
function shouldScheduleFocusForOpenShell(state: EditorState): boolean {
  const open = state.field(tableShellOpenField);
  if (!open) {
    return false;
  }
  const suppressed = state.field(suppressedTableLines);
  const anchor = state.selection.main.anchor;
  const block = findBlockContaining(state.doc, anchor, suppressed);
  return block !== null && block.lineFrom === open.headerLineFrom;
}

const eskerraTableShellFocusCellPlugin = ViewPlugin.define(view => {
  if (shouldScheduleFocusForOpenShell(view.state)) {
    scheduleFocusTableCellEditor(view);
  }
  return {
    update(u: ViewUpdate): void {
      if (!u.docChanged && !u.selectionSet && u.transactions.length === 0) {
        return;
      }
      const now = u.state.field(tableShellOpenField);
      const prev = u.startState.field(tableShellOpenField);
      const opened =
        now != null
        && (prev == null || prev.headerLineFrom !== now.headerLineFrom);
      if (opened && shouldScheduleFocusForOpenShell(u.state)) {
        scheduleFocusTableCellEditor(u.view);
      }
    },
  };
});

function buildDecorations(state: EditorState): BuildResult {
  const suppressed = state.field(suppressedTableLines);
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

    const baseline = state.doc.sliceString(block.from, block.to);
    decoBuilder.add(
      block.from,
      block.to,
      Decoration.replace({
        block: true,
        widget: new EskerraTableShellWidget(block.lineFrom, baseline),
      }),
    );
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
        || effect.is(openTableShellEffect)
        || effect.is(closeTableShellEffect),
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

const eskerraTableShellSelectionBridge = EditorView.updateListener.of(update => {
  if (!update.selectionSet && !update.docChanged) {
    return;
  }
  const st = update.state;
  const anchor = st.selection.main.anchor;
  const suppressed = st.field(suppressedTableLines);
  const blockIn = findBlockContaining(st.doc, anchor, suppressed);
  const open = st.field(tableShellOpenField);
  const startOpen = update.startState.field(tableShellOpenField);

  if (update.selectionSet && open && blockIn && blockIn.lineFrom !== open.headerLineFrom) {
    const raw = st.doc.sliceString(blockIn.from, blockIn.to).split('\n');
    if (parseEskerraTableV1FromLines(raw).ok) {
      update.view.dispatch({
        effects: openTableShellEffect.of({
          headerLineFrom: blockIn.lineFrom,
          baselineText: st.doc.sliceString(blockIn.from, blockIn.to),
        }),
      });
      return;
    }
  }

  if (!open && !startOpen && blockIn) {
    const raw = st.doc.sliceString(blockIn.from, blockIn.to).split('\n');
    if (parseEskerraTableV1FromLines(raw).ok) {
      update.view.dispatch({
        effects: openTableShellEffect.of({
          headerLineFrom: blockIn.lineFrom,
          baselineText: st.doc.sliceString(blockIn.from, blockIn.to),
        }),
      });
    }
  }
});

export function eskerraTableV1Extension(): readonly Extension[] {
  return [
    suppressedTableLines,
    tableShellOpenField,
    tableBuilt,
    eskerraTableShellSelectionBridge,
    eskerraTableShellFocusCellPlugin,
  ];
}

/** @internal exported for tests / tooling that dispatch effects by name */
export {
  closeTableShellEffect,
  openTableShellEffect,
  suppressTableWidgetAt,
  clearTableSuppressionAt,
};
