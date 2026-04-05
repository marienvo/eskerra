import {CompletionContext, type Completion} from '@codemirror/autocomplete';
import {html, htmlCompletionSource} from '@codemirror/lang-html';
import {
  commonmarkLanguage,
  markdownKeymap,
  pasteURLAsLink,
} from '@codemirror/lang-markdown';
import {
  Language,
  LanguageDescription,
  LanguageSupport,
  ParseContext,
  foldService,
  syntaxTree,
} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {parseCode, type MarkdownExtension, MarkdownParser} from '@lezer/markdown';
import {EditorState, Prec, type Extension} from '@codemirror/state';
import {keymap} from '@codemirror/view';

const htmlNoMatch = html({matchClosingTags: false});

function getCodeParser(
  languages:
    | readonly LanguageDescription[]
    | ((info: string) => Language | LanguageDescription | null)
    | undefined,
  defaultLanguage: Language | undefined,
) {
  return (info: string) => {
    if (info && languages) {
      let found: Language | LanguageDescription | null = null;
      info = /\S*/.exec(info)![0];
      if (typeof languages === 'function') {
        found = languages(info);
      } else {
        found = LanguageDescription.matchLanguageName(languages, info, true);
      }
      if (found instanceof LanguageDescription) {
        return found.support
          ? found.support.language.parser
          : ParseContext.getSkippingParser(found.load());
      }
      if (found) {
        return found.parser;
      }
    }
    return defaultLanguage ? defaultLanguage.parser : null;
  };
}

/** Exported for smart-expand and other heading-section consumers; matches fold logic. */
export function markdownHeadingLevel(typeName: string): number | null {
  const m = /^(?:ATX|Setext)Heading(\d)$/.exec(typeName);
  return m ? +m[1] : null;
}

/** Exclusive end offset of the section headed by `headerNode` (sibling blocks up to next same-or-higher heading). */
export function findSectionEnd(headerNode: SyntaxNode, level: number): number {
  let last = headerNode;
  for (;;) {
    const next = last.nextSibling;
    let heading: number | null;
    if (
      !next
      || (heading = markdownHeadingLevel(next.type.name)) != null
        && heading <= level
    ) {
      break;
    }
    last = next;
  }
  return last.to;
}

/**
 * Same heading-section fold as `@codemirror/lang-markdown` `headerIndent`, but skips H1 so the
 * document title line never shows a section fold affordance.
 */
const headerSectionFoldH2Plus = foldService.of((state, start, end) => {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(end, -1);
  while (node) {
    if (node.from < start) {
      break;
    }
    const heading = markdownHeadingLevel(node.type.name);
    if (heading == null) {
      node = node.parent;
      continue;
    }
    if (heading <= 1) {
      node = node.parent;
      continue;
    }
    const upto = findSectionEnd(node, heading);
    if (upto > end) {
      return {from: end, to: upto};
    }
    node = node.parent;
  }
  return null;
});

let htmlTagCompletionOptionsMemo: readonly Completion[] | null = null;

function htmlTagCompletions(): readonly Completion[] {
  if (htmlTagCompletionOptionsMemo) {
    return htmlTagCompletionOptionsMemo;
  }
  const result = htmlCompletionSource(
    new CompletionContext(EditorState.create({extensions: htmlNoMatch}), 0, true),
  );
  return (htmlTagCompletionOptionsMemo = result ? result.options : []);
}

function htmlTagCompletion(context: CompletionContext) {
  const {state, pos} = context;
  const m = /<[:\-.\w\u00b7-\uffff]*$/.exec(state.sliceDoc(pos - 25, pos));
  if (!m) {
    return null;
  }
  let tree = syntaxTree(state).resolveInner(pos, -1);
  while (tree && !tree.type.isTop) {
    if (
      tree.name === 'CodeBlock'
      || tree.name === 'FencedCode'
      || tree.name === 'ProcessingInstructionBlock'
      || tree.name === 'CommentBlock'
      || tree.name === 'Link'
      || tree.name === 'Image'
    ) {
      return null;
    }
    tree = tree.parent!;
  }
  return {
    from: pos - m[0].length,
    to: pos,
    options: htmlTagCompletions(),
    validFor: /^<[:\-.\w\u00b7-\uffff]*$/,
  };
}

/**
 * Like {@link import('@codemirror/lang-markdown').markdown}, but replaces default heading-section
 * folding so **H1 never folds** (ATX and Setext). All other behavior matches the stock helper.
 */
export function markdownEskerra(
  config: {
    defaultCodeLanguage?: Language | LanguageSupport;
    codeLanguages?:
      | readonly LanguageDescription[]
      | ((info: string) => Language | LanguageDescription | null);
    addKeymap?: boolean;
    extensions?: MarkdownExtension;
    base?: Language;
    completeHTMLTags?: boolean;
    pasteURLAsLink?: boolean;
    htmlTagLanguage?: LanguageSupport;
  } = {},
): LanguageSupport {
  const {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: baseLanguage = commonmarkLanguage,
    completeHTMLTags = true,
    pasteURLAsLink: pasteURL = true,
    htmlTagLanguage = htmlNoMatch,
  } = config;
  const {parser, data: languageData} = baseLanguage;
  if (!(parser instanceof MarkdownParser)) {
    throw new RangeError(
      'Base parser provided to `markdownEskerra` should be a Markdown parser',
    );
  }
  const mdExtensions: MarkdownExtension[] = config.extensions
    ? [config.extensions]
    : [];
  const support: Extension[] = [htmlTagLanguage.support, headerSectionFoldH2Plus];
  let defaultCode: Language | undefined;
  if (pasteURL) {
    support.push(pasteURLAsLink);
  }
  if (defaultCodeLanguage instanceof LanguageSupport) {
    support.push(defaultCodeLanguage.support);
    defaultCode = defaultCodeLanguage.language;
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage;
  }
  const codeParser
    = codeLanguages || defaultCode
      ? getCodeParser(codeLanguages, defaultCode)
      : undefined;
  mdExtensions.push(
    parseCode({codeParser, htmlParser: htmlTagLanguage.language.parser}),
  );
  if (addKeymap) {
    support.push(Prec.high(keymap.of(markdownKeymap)));
  }
  const lang = new Language(
    languageData,
    parser.configure(mdExtensions),
    [],
    'markdown',
  );
  if (completeHTMLTags) {
    support.push(lang.data.of({autocomplete: htmlTagCompletion}));
  }
  return new LanguageSupport(lang, support);
}
