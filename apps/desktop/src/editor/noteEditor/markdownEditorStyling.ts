import {markdownLanguage} from '@codemirror/lang-markdown';
import {Strikethrough, type MarkdownConfig, type MarkdownExtension} from '@lezer/markdown';
import type {SyntaxNode, Tree} from '@lezer/common';
import {
  HighlightStyle,
  syntaxHighlighting,
  ensureSyntaxTree,
  syntaxTree,
  foldService,
} from '@codemirror/language';
import type {Extension, Range, Text} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {tags, styleTags, Tag} from '@lezer/highlight';

import {markdownMarkerFocusLineExtension} from './markdownMarkerFocusLine';

const SYNTAX_TREE_BUDGET_MS = 200;

/** Same delimiter-boundary heuristic as @lezer/markdown Strikethrough (ASCII `Punctuation` set). */
const MARKDOWN_PUNCT_OR_SYMBOL =
  /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1\u2010-\u2027]/;

/** ATX `#` … `######` (and related header marks); split from other `processingInstruction` marks for Ulysses-style gutter styling. */
export const markdownHeaderMarkTag = Tag.define();

/** `-` / `1.` list markers and GFM `TaskMarker`; not `tags.list` (that colors whole list subtrees in Lezer). */
export const markdownListMarkTag = Tag.define();

/** Visible `%%…%%` span (Notebox extension); inner content is smaller gray text. */
const markdownPercentMutedContentTag = Tag.define();

/** `%%` delimiter characters; separate from {@link tags.processingInstruction} so they can be tinted lighter. */
const markdownPercentMarkTag = Tag.define();

/** `==…==` highlight span (common markdown extension); inner content gets a marker background in the editor. */
const markdownEqualHighlightContentTag = Tag.define();

/** `==` delimiter characters. */
const markdownEqualHighlightMarkTag = Tag.define();

const PercentMutedDelim = {resolve: 'PercentMuted', mark: 'PercentMark'};

const EqualHighlightDelim = {resolve: 'EqualHighlight', mark: 'EqualHighlightMark'};

const noteboxPercentMutedExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'PercentMuted',
      style: {'PercentMuted/...': markdownPercentMutedContentTag},
    },
    {
      name: 'PercentMark',
      style: markdownPercentMarkTag,
    },
  ],
  parseInline: [
    {
      name: 'PercentMuted',
      parse(cx, next, pos) {
        if (
          next !== 37 /* '%' */ ||
          cx.char(pos + 1) !== 37 ||
          cx.char(pos + 2) === 37
        ) {
          return -1;
        }
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = MARKDOWN_PUNCT_OR_SYMBOL.test(before);
        const pAfter = MARKDOWN_PUNCT_OR_SYMBOL.test(after);
        return cx.addDelimiter(
          PercentMutedDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: 'Strikethrough',
    },
  ],
};

const noteboxEqualHighlightExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'EqualHighlight',
      style: {'EqualHighlight/...': markdownEqualHighlightContentTag},
    },
    {
      name: 'EqualHighlightMark',
      style: markdownEqualHighlightMarkTag,
    },
  ],
  parseInline: [
    {
      name: 'EqualHighlight',
      parse(cx, next, pos) {
        if (
          next !== 61 /* '=' */ ||
          cx.char(pos + 1) !== 61 ||
          cx.char(pos + 2) === 61
        ) {
          return -1;
        }
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = MARKDOWN_PUNCT_OR_SYMBOL.test(before);
        const pAfter = MARKDOWN_PUNCT_OR_SYMBOL.test(after);
        return cx.addDelimiter(
          EqualHighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: 'PercentMuted',
    },
  ],
};

/** Pass to `markdown({ extensions: noteMarkdownParserExtensions })`. */
export const markdownHeaderMarkParserExtension: MarkdownExtension = {
  props: [
    styleTags({
      HeaderMark: markdownHeaderMarkTag,
    }),
  ],
};

/** Override Lezer defaults so `ListMark` is not grouped with `QuoteMark` as generic `processingInstruction` only. */
export const markdownListMarkParserExtension: MarkdownExtension = {
  props: [
    styleTags({
      ListMark: markdownListMarkTag,
      TaskMarker: markdownListMarkTag,
    }),
  ],
};

/** Parser extensions for the vault markdown editor (header mark styling, GFM strikethrough, `%%` muted, `==` highlight). */
export const noteMarkdownParserExtensions: MarkdownExtension = [
  markdownHeaderMarkParserExtension,
  markdownListMarkParserExtension,
  Strikethrough,
  noteboxPercentMutedExtension,
  noteboxEqualHighlightExtension,
];

const markdownHighlightStyle = HighlightStyle.define(
  [
    {tag: tags.heading, class: 'cm-md-heading'},
    {tag: tags.heading1, class: 'cm-md-h1'},
    {tag: tags.heading2, class: 'cm-md-h2'},
    {tag: tags.heading3, class: 'cm-md-h3'},
    {tag: tags.heading4, class: 'cm-md-h4'},
    {tag: tags.heading5, class: 'cm-md-h5'},
    {tag: tags.heading6, class: 'cm-md-h6'},
    {tag: markdownHeaderMarkTag, class: 'cm-md-header-mark'},
    {tag: tags.strong, class: 'cm-md-strong'},
    {tag: tags.emphasis, class: 'cm-md-emphasis'},
    {tag: tags.strikethrough, class: 'cm-md-strikethrough'},
    {tag: markdownPercentMutedContentTag, class: 'cm-md-percent-muted'},
    {tag: markdownPercentMarkTag, class: 'cm-md-percent-mark'},
    {tag: markdownEqualHighlightContentTag, class: 'cm-md-equal-highlight'},
    {tag: markdownEqualHighlightMarkTag, class: 'cm-md-equal-highlight-mark'},
    {tag: tags.contentSeparator, class: 'cm-md-hr'},
    {tag: tags.processingInstruction, class: 'cm-md-syntax-mark'},
    {tag: markdownListMarkTag, class: 'cm-md-list-mark'},
    {tag: tags.monospace, class: 'cm-md-code'},
  ],
  {scope: markdownLanguage},
);

/** Same range as @codemirror/lang-markdown `foldNodeProp` for `ListItem`; foldService runs before syntax folding. */
export const noteMarkdownListItemFoldService: Extension = foldService.of((state, _lineFrom, lineTo) => {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(lineTo, -1);
  while (node) {
    if (node.type.name === 'ListItem') {
      const firstLine = state.doc.lineAt(node.from);
      const foldFrom = firstLine.to;
      if (foldFrom < node.to) {
        return {from: foldFrom, to: node.to};
      }
      return null;
    }
    node = node.parent;
  }
  return null;
});

/** Exposed for Vitest (`highlightTree` + list body must not use removed `tags.list` → `cm-md-list`). */
export const noteMarkdownHighlightStyle = markdownHighlightStyle;

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

/** Caps CSS classes `cm-md-list-line--nest-*` (_padding per level in App.css). */
const LIST_NEST_DEPTH_CLASS_MAX = 8;

function listItemNestDepth(item: SyntaxNode): number {
  let depth = 0;
  let n: SyntaxNode | null = item.parent;
  while (n) {
    if (n.type.name === 'ListItem') depth++;
    n = n.parent;
  }
  return depth;
}

/** First `ListItem` when walking from `resolveInner(pos)` toward the root (the smallest item containing `pos`). */
function innermostListItemCovering(tree: Tree, pos: number): SyntaxNode | null {
  let current: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (current) {
    if (current.type.name === 'ListItem') {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/** Prefer end-of-line so leading indent before `ListMark` still resolves to the nested item. */
function listItemOwnerProbePos(line: {from: number; to: number}): number {
  return line.to > line.from ? line.to - 1 : line.from;
}

function lineHasListOrTaskMark(tree: Tree, lineFrom: number, lineTo: number): boolean {
  let found = false;
  tree.iterate({
    from: lineFrom,
    to: lineTo,
    enter(node) {
      if (node.name === 'ListMark' || node.name === 'TaskMarker') {
        found = true;
        return false;
      }
    },
  });
  return found;
}

function addListItemLines(
  doc: Text,
  tree: Tree,
  itemFrom: number,
  itemTo: number,
  listKind: 'bullet' | 'ordered',
  nestDepth: number,
  lineClasses: Map<number, Set<string>>,
) {
  const kindVariant =
    listKind === 'ordered' ? 'cm-md-list-line--ordered' : 'cm-md-list-line--bullet';
  const nestClass =
    nestDepth > 0
      ? `cm-md-list-line--nest-${Math.min(nestDepth, LIST_NEST_DEPTH_CLASS_MAX)}`
      : null;
  const end = Math.min(itemTo, doc.length);
  let pos = itemFrom;
  while (pos <= end) {
    const line = doc.lineAt(pos);
    const owner = innermostListItemCovering(tree, listItemOwnerProbePos(line));
    if (owner == null || owner.from !== itemFrom) {
      pos = line.to + 1;
      continue;
    }
    const rowKind = lineHasListOrTaskMark(tree, line.from, Math.min(line.to, doc.length))
      ? 'cm-md-list-line--mark'
      : 'cm-md-list-line--continue';
    addLineClass(lineClasses, line.from, 'cm-md-list-line');
    addLineClass(lineClasses, line.from, kindVariant);
    addLineClass(lineClasses, line.from, rowKind);
    if (nestClass) {
      addLineClass(lineClasses, line.from, nestClass);
    }
    pos = line.to + 1;
  }
}

/**
 * Line-level class map for block styling (headings, fences, lists). Exported for Vitest.
 */
export function markdownEditorBlockLineClasses(doc: Text, tree: Tree): Map<number, Set<string>> {
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
        const parentName = cursor.node.parent?.type.name;
        const listKind = parentName === 'OrderedList' ? 'ordered' : 'bullet';
        const nestDepth = listItemNestDepth(cursor.node);
        addListItemLines(doc, tree, cursor.from, cursor.to, listKind, nestDepth, lineClasses);
        /* Do not return: nested ListItem nodes must be visited for line classes + nest depth. */
      }
      if (name === 'HorizontalRule') {
        addLinesInRange(doc, cursor.from, cursor.to, lineClasses, 'cm-md-hr-line');
      }
    },
  });

  return lineClasses;
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

  const lineClasses = markdownEditorBlockLineClasses(doc, tree);

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
      if (
        update.docChanged
        || syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
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
  markdownMarkerFocusLineExtension,
];
