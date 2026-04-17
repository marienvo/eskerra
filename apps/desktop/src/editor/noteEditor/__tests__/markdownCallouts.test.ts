import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {buildMarkdownCalloutDecorations} from '../markdownCallouts';
import {noteMarkdownParserExtensions} from '../markdownEditorStyling';
import {markdownEskerra} from '../markdownEskerraLanguage';

function stateAndTree(md: string) {
  const state = EditorState.create({
    doc: md,
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 20_000);
  expect(tree).not.toBeNull();
  return {doc: state.doc, tree: tree!};
}

/** Line number -> merged `class` string from callout line decorations on that line's `from`. */
function calloutLineClassesByLineNumber(doc: EditorState['doc'], tree: Parameters<typeof buildMarkdownCalloutDecorations>[1]): Record<number, string> {
  const ranges = buildMarkdownCalloutDecorations(doc, tree);
  const out: Record<number, string> = {};
  for (const r of ranges) {
    const deco = r.value as {spec?: {class?: string}};
    const cls = deco.spec?.class;
    if (!cls || !cls.includes('cm-eskerra-callout-line')) {
      continue;
    }
    const line = doc.lineAt(r.from);
    out[line.number] = cls;
  }
  return out;
}

function calloutLabelMarkRanges(doc: EditorState['doc'], tree: Parameters<typeof buildMarkdownCalloutDecorations>[1]): {from: number; to: number; text: string}[] {
  const ranges = buildMarkdownCalloutDecorations(doc, tree);
  const out: {from: number; to: number; text: string}[] = [];
  for (const r of ranges) {
    const deco = r.value as {spec?: {class?: string}};
    const cls = deco.spec?.class;
    if (cls === 'cm-eskerra-callout-label') {
      out.push({from: r.from, to: r.to, text: doc.sliceString(r.from, r.to)});
    }
  }
  return out;
}

describe('buildMarkdownCalloutDecorations', () => {
  it('decorates a single-line callout with info color and label mark', () => {
    const md = '> [!info] msg';
    const {doc, tree} = stateAndTree(md);
    const byLine = calloutLineClassesByLineNumber(doc, tree);
    expect(byLine[1]).toContain('cm-eskerra-callout-line');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--type-info');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--color-cyan');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--first');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--last');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--has-custom-title');

    const marks = calloutLabelMarkRanges(doc, tree);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.text).toBe('[!info]');
  });

  it('decorates every line of a multi-line callout', () => {
    const md = '> [!warning] Title\n> body line\n> end';
    const {doc, tree} = stateAndTree(md);
    const byLine = calloutLineClassesByLineNumber(doc, tree);
    expect(byLine[1]).toContain('cm-eskerra-callout-line--type-warning');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--first');
    expect(byLine[2]).toContain('cm-eskerra-callout-line--type-warning');
    expect(byLine[2]).not.toContain('cm-eskerra-callout-line--first');
    expect(byLine[3]).toContain('cm-eskerra-callout-line--last');
  });

  it('does not treat nested quote markers on one line as a callout', () => {
    const md = '> > [!tip] nested';
    const {doc, tree} = stateAndTree(md);
    const byLine = calloutLineClassesByLineNumber(doc, tree);
    expect(Object.keys(byLine)).toHaveLength(0);
    expect(calloutLabelMarkRanges(doc, tree)).toHaveLength(0);
  });

  it('falls back to note styling for unknown bracket types', () => {
    const md = '> [!unknownthing] x';
    const {doc, tree} = stateAndTree(md);
    const byLine = calloutLineClassesByLineNumber(doc, tree);
    expect(byLine[1]).toContain('cm-eskerra-callout-line--type-note');
    expect(byLine[1]).toContain('cm-eskerra-callout-line--color-blue');
  });

  it('does not decorate a plain blockquote', () => {
    const md = '> just text\n> more';
    const {doc, tree} = stateAndTree(md);
    expect(Object.keys(calloutLineClassesByLineNumber(doc, tree))).toHaveLength(0);
  });

  it('decorates only the callout blockquote when a plain blockquote precedes it', () => {
    const md = '> plain\n\n> [!danger] boom';
    const {doc, tree} = stateAndTree(md);
    const byLine = calloutLineClassesByLineNumber(doc, tree);
    expect(byLine[1]).toBeUndefined();
    expect(byLine[3]).toContain('cm-eskerra-callout-line--type-danger');
  });
});
