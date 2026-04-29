import {describe, expect, it} from 'vitest';

import {buildVaultTabLinkDerivedData} from './vaultTabLinkDerived';

const refs = [
  {name: 'Alpha.md', uri: '/vault/Inbox/Alpha.md'},
  {name: 'Source.md', uri: '/vault/Inbox/Source.md'},
  {name: 'Target.md', uri: '/vault/Inbox/Target.md'},
  {name: 'Daily.md', uri: '/vault/General/Daily.md'},
] as const;

describe('buildVaultTabLinkDerivedData', () => {
  it('resolves existing wiki links', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: '/vault/Inbox/Source.md',
      showTodayHubCanvas: false,
    });

    expect(derived.wikiLinkTargetIsResolved('Alpha')).toBe(true);
  });

  it('leaves missing wiki links unresolved', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: '/vault/Inbox/Source.md',
      showTodayHubCanvas: false,
    });

    expect(derived.wikiLinkTargetIsResolved('Missing')).toBe(false);
  });

  it('resolves relative markdown links from the selected note source', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: '/vault/Inbox/Source.md',
      showTodayHubCanvas: false,
    });

    expect(derived.relativeMarkdownSourceUriOrDir).toBe('/vault/Inbox/Source.md');
    expect(derived.relativeMarkdownLinkHrefIsResolved('Target.md')).toBe(true);
    expect(derived.relativeMarkdownLinkHrefIsResolved('Missing.md')).toBe(false);
  });

  it('uses Inbox as source while composing', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: true,
      selectedUri: '/vault/General/Daily.md',
      showTodayHubCanvas: true,
    });

    expect(derived.relativeMarkdownSourceUriOrDir).toBe('/vault/Inbox');
    expect(derived.relativeMarkdownLinkHrefIsResolved('Target.md')).toBe(true);
  });

  it('uses General as source for Today hub canvas links', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: '/vault/General/Today.md',
      showTodayHubCanvas: true,
    });

    expect(derived.relativeMarkdownSourceUriOrDir).toBe('/vault/General');
    expect(derived.relativeMarkdownLinkHrefIsResolved('Daily.md')).toBe(true);
  });

  it('falls back to Inbox as source when no note is selected', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: null,
      showTodayHubCanvas: false,
    });

    expect(derived.relativeMarkdownSourceUriOrDir).toBe('/vault/Inbox');
  });

  it('builds wiki completion candidates from markdown refs', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: refs,
      composingNewEntry: false,
      selectedUri: '/vault/Inbox/Source.md',
      showTodayHubCanvas: false,
    });

    expect(derived.wikiLinkCompletionCandidates.map(c => c.label)).toEqual([
      'Alpha',
      'Daily',
      'Source',
      'Target',
    ]);
    expect(derived.wikiLinkCompletionCandidates.map(c => c.insertTarget)).toEqual([
      'Alpha',
      'Daily',
      'Source',
      'Target',
    ]);
  });

  it('returns no completion candidates and no resolved links when refs are missing', () => {
    const derived = buildVaultTabLinkDerivedData({
      vaultRoot: '/vault',
      vaultMarkdownRefs: [],
      composingNewEntry: false,
      selectedUri: '/vault/Inbox/Source.md',
      showTodayHubCanvas: false,
    });

    expect(derived.wikiLinkCompletionCandidates).toEqual([]);
    expect(derived.wikiLinkTargetIsResolved('Alpha')).toBe(false);
    expect(derived.relativeMarkdownLinkHrefIsResolved('Target.md')).toBe(false);
  });
});
