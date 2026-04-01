import {markdownLanguage} from '@codemirror/lang-markdown';
import {
  HighlightStyle,
  syntaxHighlighting,
  ensureSyntaxTree,
} from '@codemirror/language';
import type {Extension, Range, Text} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {tags} from '@lezer/highlight';

const SYNTAX_TREE_BUDGET_MS = 200;

const markdownHighlightStyle = HighlightStyle.define(
  [
    {tag: tags.heading, class: 'cm-md-heading'},
    {tag: tags.heading1, class: 'cm-md-h1'},
    {tag: tags.heading2, class: 'cm-md-h2'},
    {tag: tags.heading3, class: 'cm-md-h3'},
    {tag: tags.heading4, class: 'cm-md-h4'},
    {tag: tags.heading5, class: 'cm-md-h5'},
    {tag: tags.heading6, class: 'cm-md-h6'},
    {tag: tags.processingInstruction, class: 'cm-md-syntax-mark'},
    {tag: tags.list, class: 'cm-md-list'},
    {tag: tags.monospace, class: 'cm-md-code'},
  ],
  {scope: markdownLanguage},
);

function addLineClass(lineClasses: Map<number, Set<string>>, lineFrom: number, cls: string) {
  let bucket = lineClasses.get(lineFrom);
  if (!bucket) {
    bucket = new Set();
    lineClasses.set(lineFrom, bucket);
  }
  bucket.add(cls);
}

function addFenceLines(
  doc: Text,
  from: number,
  to: number,
  lineClasses: Map<number, Set<string>>,
) {
  const end = Math.min(to, doc.length);
  const firstN = doc.lineAt(from).number;
  const lastN = doc.lineAt(end).number;
  for (let n = firstN; n <= lastN; n++) {
    const line = doc.line(n);
    addLineClass(lineClasses, line.from, 'cm-md-fence-line');
    if (n === firstN) {
      addLineClass(lineClasses, line.from, 'cm-md-fence-line--first');
    }
    if (n === lastN) {
      addLineClass(lineClasses, line.from, 'cm-md-fence-line--last');
    }
  }
}

function addLinesInRange(
  doc: Text,
  from: number,
  to: number,
  lineClasses: Map<number, Set<string>>,
  cls: string,
) {
  const end = Math.min(to, doc.length);
  let pos = from;
  while (pos <= end) {
    const line = doc.lineAt(pos);
    addLineClass(lineClasses, line.from, cls);
    pos = line.to + 1;
  }
}

function headingLevelFromNode(name: string): string | null {
  const atx = /^ATXHeading(\d)$/.exec(name);
  if (atx) {
    return atx[1];
  }
  const setext = /^SetextHeading(\d)$/.exec(name);
  if (setext) {
    return setext[1];
  }
  return null;
}

function buildBlockLineDecorations(view: EditorView): DecorationSet {
  const {doc} = view.state;
  const tree = ensureSyntaxTree(view.state, doc.length, SYNTAX_TREE_BUDGET_MS);
  if (!tree) {
    return Decoration.none;
  }

  const lineClasses = new Map<number, Set<string>>();

  tree.iterate({
    enter(cursor) {
      const name = cursor.type.name;
      if (name === 'FencedCode' || name === 'CodeBlock') {
        addFenceLines(doc, cursor.from, cursor.to, lineClasses);
        return;
      }
      const level = headingLevelFromNode(name);
      if (level != null) {
        addLinesInRange(
          doc,
          cursor.from,
          cursor.to,
          lineClasses,
          `cm-md-heading-line cm-md-heading-line--h${level}`,
        );
        return;
      }
      if (name === 'ListItem') {
        addLinesInRange(doc, cursor.from, cursor.to, lineClasses, 'cm-md-list-line');
      }
    },
  });

  const ranges: Range<Decoration>[] = [];
  const ordered = [...lineClasses.entries()].sort((a, b) => a[0] - b[0]);
  for (const [lineFrom, classes] of ordered) {
    const className = [...classes].sort().join(' ');
    ranges.push(Decoration.line({class: className}).range(lineFrom));
  }

  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

const markdownBlockLineStyle = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildBlockLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildBlockLineDecorations(update.view);
      }
    }
  },
  {decorations: v => v.decorations},
);

/** Typography and block styling for the inbox markdown editor (Lezer markdown only). */
export const noteMarkdownEditorAppearance: Extension[] = [
  syntaxHighlighting(markdownHighlightStyle),
  markdownBlockLineStyle,
];
