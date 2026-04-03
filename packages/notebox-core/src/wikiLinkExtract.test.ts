import {describe, expect, it} from 'vitest';

import {extractWikiLinkInnersFromMarkdown} from './wikiLinkExtract';

describe('extractWikiLinkInnersFromMarkdown', () => {
  it('extracts plain and display-form wiki links', () => {
    expect(
      extractWikiLinkInnersFromMarkdown('See [[Alpha]] and [[Inbox/Beta|Shown]].'),
    ).toEqual(['Alpha', 'Inbox/Beta|Shown']);
  });

  it('keeps empty display segment and skips empty targets', () => {
    expect(
      extractWikiLinkInnersFromMarkdown('A [[target|]] B [[|display]] C [[ ]]'),
    ).toEqual(['target|', '|display', ' ']);
  });

  it('extracts consecutive and multiline links', () => {
    expect(
      extractWikiLinkInnersFromMarkdown('[[One]][[Two]]\nline [[Three]]'),
    ).toEqual(['One', 'Two', 'Three']);
  });

  it('returns empty when no links exist', () => {
    expect(extractWikiLinkInnersFromMarkdown('no wiki links here')).toEqual([]);
  });
});
