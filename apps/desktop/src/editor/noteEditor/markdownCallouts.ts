import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import type {Extension, Range, Text} from '@codemirror/state';
import type {Tree} from '@lezer/common';
import {matchCalloutHeader, resolveCallout} from '@eskerra/core';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const SYNTAX_TREE_BUDGET_MS = 200;

const labelMark = Decoration.mark({class: 'cm-eskerra-callout-label'});

type LineBuild = {
  classes: Set<string>;
  attrs: Record<string, string>;
};

function addLineClass(
  lineMap: Map<number, LineBuild>,
  lineFrom: number,
  cls: string,
  attrs?: Record<string, string>,
) {
  let b = lineMap.get(lineFrom);
  if (!b) {
    b = {classes: new Set(), attrs: {}};
    lineMap.set(lineFrom, b);
  }
  b.classes.add(cls);
  if (attrs) {
    Object.assign(b.attrs, attrs);
  }
}

/**
 * Builds merged line + mark decorations for Obsidian/GitHub-style callouts inside Lezer `Blockquote` nodes.
 */
export function buildMarkdownCalloutDecorations(doc: Text, tree: Tree): Range<Decoration>[] {
  const lineMap = new Map<number, LineBuild>();
  const markRanges: Range<Decoration>[] = [];

  tree.iterate({
    enter(cursor) {
      if (cursor.name !== 'Blockquote') {
        return;
      }
      const blockFrom = cursor.from;
      const blockTo = Math.min(cursor.to, doc.length);
      if (blockFrom >= blockTo) {
        return;
      }

      const firstLine = doc.lineAt(blockFrom);
      const header = matchCalloutHeader(firstLine.text);
      if (!header) {
        return;
      }

      const meta = resolveCallout(header.rawType);
      const markFrom = firstLine.from + header.startCol;
      const markTo = firstLine.from + header.endCol;
      if (markFrom < markTo && markTo <= firstLine.to) {
        markRanges.push(labelMark.range(markFrom, markTo));
      }

      const firstN = firstLine.number;
      const lastN = doc.lineAt(Math.max(blockFrom, blockTo - 1)).number;

      const defaultLabel = header.title.trim() === '' ? meta.label : '';
      const lineAttrs: Record<string, string> = {
        'data-eskerra-callout-icon': meta.icon,
        'data-eskerra-callout-color': meta.color,
      };
      if (defaultLabel) {
        lineAttrs['data-eskerra-callout-default-label'] = defaultLabel;
      }

      let pos = blockFrom;
      while (pos < blockTo) {
        const line = doc.lineAt(pos);
        const isFirst = line.number === firstN;
        const isLast = line.number === lastN;

        addLineClass(lineMap, line.from, 'cm-eskerra-callout-line');
        addLineClass(lineMap, line.from, `cm-eskerra-callout-line--type-${meta.type}`);
        addLineClass(lineMap, line.from, `cm-eskerra-callout-line--color-${meta.color}`);
        if (header.title.trim()) {
          addLineClass(lineMap, line.from, 'cm-eskerra-callout-line--has-custom-title');
        }
        if (isFirst) {
          addLineClass(lineMap, line.from, 'cm-eskerra-callout-line--first', lineAttrs);
        }
        if (isLast) {
          addLineClass(lineMap, line.from, 'cm-eskerra-callout-line--last');
        }

        pos = line.to + 1;
      }
    },
  });

  const ranges: Range<Decoration>[] = [];
  const orderedLines = [...lineMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [lineFrom, build] of orderedLines) {
    const className = [...build.classes].sort().join(' ');
    const attrs = Object.keys(build.attrs).length ? build.attrs : undefined;
    ranges.push(Decoration.line({class: className, attributes: attrs}).range(lineFrom));
  }
  ranges.push(...markRanges.sort((a, b) => a.from - b.from));
  return ranges;
}

function buildCalloutDecorationSet(view: EditorView): DecorationSet {
  const {doc} = view.state;
  const tree = ensureSyntaxTree(view.state, doc.length, SYNTAX_TREE_BUDGET_MS);
  if (!tree) {
    return Decoration.none;
  }
  const ranges = buildMarkdownCalloutDecorations(doc, tree);
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

const markdownCalloutsViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildCalloutDecorationSet(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildCalloutDecorationSet(update.view);
      }
    }
  },
  {decorations: v => v.decorations},
);

/** Callout line + label mark decorations for the vault markdown editor. */
export const markdownCalloutsPlugin: Extension = markdownCalloutsViewPlugin;
