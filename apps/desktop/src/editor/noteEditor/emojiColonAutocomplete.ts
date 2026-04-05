/**
 * Emoji completion after `:query` in markdown (desktop vault editor).
 *
 * Search index is generated from emojibase-data (MIT); regenerate with:
 * `npm run generate-emoji-data` in apps/desktop.
 */
import type {Completion, CompletionContext, CompletionSource} from '@codemirror/autocomplete';

import {
  colonQueryFromEmojiPrefixMatch,
  EMOJI_COLON_PREFIX_PATTERN,
  type EmojiCompletionRow,
  filterSortAndCapEmojiRows,
  isEmojiCompletionDisabledInMarkdown,
} from './emojiColonAutocompleteHelpers';

export const EMOJI_COMPLETION_MAX_OPTIONS = 50;

let cachedRows: readonly EmojiCompletionRow[] | null = null;
let loadPromise: Promise<void> | null = null;

function ensureEmojiRowsLoaded(): Promise<void> {
  if (cachedRows) {
    return Promise.resolve();
  }
  if (!loadPromise) {
    loadPromise = import('./data/emojiColonCompletionData.json').then(mod => {
      cachedRows = mod.default as EmojiCompletionRow[];
    });
  }
  return loadPromise;
}

function buildEmojiCompletions(
  rows: readonly EmojiCompletionRow[],
  queryLower: string,
): Completion[] {
  const picked = filterSortAndCapEmojiRows(
    rows,
    queryLower,
    EMOJI_COMPLETION_MAX_OPTIONS,
  );
  return picked.map(
    (row): Completion => ({
      label: `:${row.p}:`,
      displayLabel: `${row.e} :${row.p}:`,
      detail: row.e,
      apply: row.e,
    }),
  );
}

export const emojiColonCompletionSource: CompletionSource = (
  context: CompletionContext,
) => {
  const match = context.matchBefore(EMOJI_COLON_PREFIX_PATTERN);
  if (!match) {
    return null;
  }
  const parsed = colonQueryFromEmojiPrefixMatch(match);
  if (!parsed || parsed.query.length < 1) {
    return null;
  }
  if (isEmojiCompletionDisabledInMarkdown(context.state, context.pos)) {
    return null;
  }

  const queryLower = parsed.query.toLowerCase();

  if (cachedRows) {
    const options = buildEmojiCompletions(cachedRows, queryLower);
    if (options.length === 0) {
      return null;
    }
    return {
      from: parsed.colonFrom,
      filter: false,
      options,
    };
  }

  return ensureEmojiRowsLoaded().then(() => {
    if (!cachedRows) {
      return null;
    }
    const options = buildEmojiCompletions(cachedRows, queryLower);
    if (options.length === 0) {
      return null;
    }
    return {
      from: parsed.colonFrom,
      filter: false,
      options,
    };
  });
};
