import {autocompletion, type Completion, type CompletionContext} from '@codemirror/autocomplete';
import type {Extension} from '@codemirror/state';

import {
  filterInboxWikiLinkCompletionCandidates,
  type InboxWikiLinkCompletionCandidate,
  WIKI_LINK_COMPLETION_MAX_OPTIONS,
} from '@eskerra/core';

import {
  EMOJI_COMPLETION_MAX_OPTIONS,
  emojiColonCompletionSource,
  emojiColonSecondColonAcceptKeymap,
} from './emojiColonAutocomplete';

/** Match an unfinished wiki target right after `[[` (no `|` in the target segment). */
const wikiTargetPrefix = /\[\[([^\]|]*)$/;

function inboxWikiLinkCompletions(
  getCandidates: () => ReadonlyArray<InboxWikiLinkCompletionCandidate>,
) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(wikiTargetPrefix);
    if (!match) {
      return null;
    }
    const prefix = match.text.slice(2);
    const filtered = filterInboxWikiLinkCompletionCandidates(
      getCandidates(),
      prefix,
      WIKI_LINK_COMPLETION_MAX_OPTIONS,
    );
    if (filtered.length === 0) {
      return null;
    }
    return {
      from: match.from + 2,
      filter: false,
      options: filtered.map(
        (c): Completion => ({
          label: c.label,
          detail: c.detail,
          apply: c.insertTarget,
        }),
      ),
    };
  };
}

export function wikiLinkAutocompleteExtension(
  getCandidates: () => ReadonlyArray<InboxWikiLinkCompletionCandidate>,
): readonly Extension[] {
  return [
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: Math.max(
        WIKI_LINK_COMPLETION_MAX_OPTIONS,
        EMOJI_COMPLETION_MAX_OPTIONS,
      ),
      override: [inboxWikiLinkCompletions(getCandidates), emojiColonCompletionSource],
    }),
    emojiColonSecondColonAcceptKeymap,
  ];
}
