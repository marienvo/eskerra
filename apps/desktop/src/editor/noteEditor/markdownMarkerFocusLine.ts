import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import {
  type EditorSelection,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import type {SyntaxNode, Tree} from '@lezer/common';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/** DOM class on each `.cm-line` that should show full markdown marker chrome. */
export const MARKER_FOCUS_LINE_CLASS = 'cm-eskerra-marker-focus-line';

const lineDeco = Decoration.line({class: MARKER_FOCUS_LINE_CLASS});

/**
 * Line `from` positions (document offsets) for lines that should show markdown markers
 * (header hashes, list marks, syntax delimiters, etc.). Used by the focus-line plugin and tests.
 */
export function computeMarkerFocusLineStarts(
  doc: Text,
  selection: EditorSelection,
): number[] {
  const lineStarts = new Set<number>();
  for (const r of selection.ranges) {
    if (r.empty) {
      lineStarts.add(doc.lineAt(r.head).from);
      continue;
    }
    const startLine = doc.lineAt(r.from);
    const endChar = Math.min(r.to - 1, doc.length);
    const endLine = doc.lineAt(Math.max(r.from, endChar));
    for (let n = startLine.number; n <= endLine.number; n++) {
      lineStarts.add(doc.line(n).from);
    }
  }
  return [...lineStarts].sort((a, b) => a - b);
}

const FENCE_TREE_BUDGET_MS = 50;

function findFencedCodeAncestor(tree: Tree, pos: number): SyntaxNode | null {
  for (const bias of [-1, 1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(pos, bias);
    while (node) {
      if (node.type.name === 'FencedCode') return node;
      node = node.parent;
    }
  }
  return null;
}

/**
 * When the cursor is inside a `FencedCode` block, adds every line of that block (including the
 * opening and closing fence markers) to `lineStarts`. This makes the whole code block — ticks and
 * all — show marker chrome as long as the caret is anywhere inside it.
 */
export function expandFocusLinesForFencedCode(
  state: EditorState,
  lineStarts: Set<number>,
): void {
  const tree =
    ensureSyntaxTree(state, state.doc.length, FENCE_TREE_BUDGET_MS) ?? syntaxTree(state);
  for (const r of state.selection.ranges) {
    const fencedCode = findFencedCodeAncestor(tree, r.head);
    if (!fencedCode) continue;
    const {doc} = state;
    const firstN = doc.lineAt(fencedCode.from).number;
    const lastN = doc.lineAt(Math.min(fencedCode.to, doc.length)).number;
    for (let n = firstN; n <= lastN; n++) {
      lineStarts.add(doc.line(n).from);
    }
  }
}

/**
 * Decoration line starts; when the view is not focused, no line gets marker-focus chrome (blur
 * must not leave wiki brackets / syntax delimiters visible as on a “focused” line).
 */
export function computeMarkerFocusDecorationStarts(
  doc: Text,
  selection: EditorSelection,
  hasFocus: boolean,
): number[] {
  if (!hasFocus) {
    return [];
  }
  return computeMarkerFocusLineStarts(doc, selection);
}

function buildMarkerFocusLineDecorations(view: EditorView): DecorationSet {
  if (!view.hasFocus) {
    return Decoration.none;
  }
  const {state} = view;
  const lineStartSet = new Set(computeMarkerFocusLineStarts(state.doc, state.selection));
  expandFocusLinesForFencedCode(state, lineStartSet);
  const ranges: Range<Decoration>[] = [...lineStartSet]
    .sort((a, b) => a - b)
    .map(from => lineDeco.range(from));
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/**
 * Marks lines that should show full markdown marker chrome so CSS can hide markers on other lines.
 */
export const markdownMarkerFocusLineExtension: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildMarkerFocusLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged
        || update.selectionSet
        || update.focusChanged
        || syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildMarkerFocusLineDecorations(update.view);
      }
    }
  },
  {decorations: v => v.decorations},
);
