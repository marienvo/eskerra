import {
  Facet,
  type EditorSelection,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/** DOM class on each `.cm-line` that should show full markdown marker chrome. */
export const MARKER_FOCUS_LINE_CLASS = 'cm-notebox-marker-focus-line';

/**
 * Eskerra **table cell** editors set this so an unfocused cell never gets marker-focus lines.
 * A one-line cell still “intersects” its local selection, which would otherwise keep all markers
 * visible in every cell; clearing decorations when the cell view lacks focus fixes that. The root note
 * editor omits this facet (empty combine → false) so blur still follows document selection.
 */
export const markdownMarkerFocusLineClearWhenUnfocusedFacet =
  Facet.define<boolean, boolean>({
    combine: values => values.some(Boolean),
  });

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

/** Decoration line starts; exposed for unit tests (cell vs root blur behavior). */
export function computeMarkerFocusDecorationStarts(
  doc: Text,
  selection: EditorSelection,
  args: {clearWhenUnfocused: boolean; hasFocus: boolean},
): number[] {
  if (args.clearWhenUnfocused && !args.hasFocus) {
    return [];
  }
  return computeMarkerFocusLineStarts(doc, selection);
}

function buildMarkerFocusLineDecorations(view: EditorView): DecorationSet {
  const clearWhenUnfocused = view.state.facet(
    markdownMarkerFocusLineClearWhenUnfocusedFacet,
  );
  const starts = computeMarkerFocusDecorationStarts(
    view.state.doc,
    view.state.selection,
    {clearWhenUnfocused, hasFocus: view.hasFocus},
  );
  const ranges: Range<Decoration>[] = starts.map(from =>
    lineDeco.range(from),
  );
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/**
 * Marks lines that should show full marker chrome so CSS can hide markers on other lines (root)
 * or in unfocused table cells (when {@link markdownMarkerFocusLineClearWhenUnfocusedFacet} is set).
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
      ) {
        this.decorations = buildMarkerFocusLineDecorations(update.view);
      }
    }
  },
  {decorations: v => v.decorations},
);
