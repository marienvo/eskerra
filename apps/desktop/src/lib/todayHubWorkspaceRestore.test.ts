import {describe, expect, it} from 'vitest';

import {
  pickDefaultActiveTodayHubUri,
  sortedTodayHubNoteUrisFromRefs,
} from './todayHubWorkspaceRestore';

describe('sortedTodayHubNoteUrisFromRefs', () => {
  it('filters and sorts Today.md paths', () => {
    expect(
      sortedTodayHubNoteUrisFromRefs([
        {uri: '/v/B/Today.md'},
        {uri: '/v/A/Today.md'},
        {uri: '/v/x.md'},
      ]),
    ).toEqual(['/v/A/Today.md', '/v/B/Today.md']);
  });
});

describe('pickDefaultActiveTodayHubUri', () => {
  const hubs = ['/v/a/Today.md', '/v/b/Today.md'];

  it('returns first hub when nothing matches', () => {
    expect(
      pickDefaultActiveTodayHubUri({
        hubUris: hubs,
        selectedUri: '/v/note.md',
        editorWorkspaceTabs: null,
        openTabUris: null,
      }),
    ).toBe('/v/a/Today.md');
  });

  it('prefers selectedUri when it is a hub', () => {
    expect(
      pickDefaultActiveTodayHubUri({
        hubUris: hubs,
        selectedUri: '  /v/b/Today.md  ',
        editorWorkspaceTabs: null,
        openTabUris: null,
      }),
    ).toBe('/v/b/Today.md');
  });

  it('finds hub in editorWorkspaceTabs entries', () => {
    expect(
      pickDefaultActiveTodayHubUri({
        hubUris: hubs,
        selectedUri: null,
        editorWorkspaceTabs: [
          {id: 't1', entries: ['/v/note.md', '/v/b/Today.md'], index: 0},
        ],
        openTabUris: null,
      }),
    ).toBe('/v/b/Today.md');
  });

  it('finds hub in openTabUris', () => {
    expect(
      pickDefaultActiveTodayHubUri({
        hubUris: hubs,
        selectedUri: null,
        editorWorkspaceTabs: null,
        openTabUris: ['/v/x.md', '/v/a/Today.md'],
      }),
    ).toBe('/v/a/Today.md');
  });

  it('returns null when hub list is empty', () => {
    expect(
      pickDefaultActiveTodayHubUri({
        hubUris: [],
        selectedUri: '/v/a/Today.md',
        editorWorkspaceTabs: null,
        openTabUris: null,
      }),
    ).toBeNull();
  });
});
