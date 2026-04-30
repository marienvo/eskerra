import {describe, expect, it} from 'vitest';

import {buildVaultTabEditorPaneDerived} from './vaultTabEditorPaneDerived';
import type {TodayHubSettings} from '../lib/todayHub';

const todayHubSettings: TodayHubSettings = {
  perpetualType: 'weekly',
  start: 'monday',
  columns: ['2026-04-27'],
};

const baseInput = {
  mergeView: null,
  inboxContentByUri: {},
  selectedUri: null,
  editorBody: '',
  showTodayHubCanvas: false,
  todayHubSettings: null,
  composingNewEntry: false,
  busy: false,
  diskConflict: null,
};

describe('buildVaultTabEditorPaneDerived', () => {
  it('uses cached inbox content for merge current body before editor body', () => {
    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      mergeView: {kind: 'backup', baseUri: '/vault/Note.md', backupUri: '/vault/Note.md.bak'},
      inboxContentByUri: {'/vault/Note.md': 'cached'},
      selectedUri: '/vault/Note.md',
      editorBody: 'editor',
    }).mergeCurrentBody).toBe('cached');
  });

  it('uses selected editor body for matching merge base when cache is missing', () => {
    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      mergeView: {kind: 'diskConflict', baseUri: '/vault/Note.md', diskMarkdown: 'disk'},
      selectedUri: '/vault/Note.md',
      editorBody: 'editor',
    }).mergeCurrentBody).toBe('editor');
  });

  it('returns empty merge current body when there is no merge view or match', () => {
    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Other.md',
      editorBody: 'editor',
    }).mergeCurrentBody).toBe('');

    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      mergeView: {kind: 'backup', baseUri: '/vault/Note.md', backupUri: '/vault/Note.md.bak'},
      selectedUri: '/vault/Other.md',
      editorBody: 'editor',
    }).mergeCurrentBody).toBe('');
  });

  it('enables Today Hub scroll layout only for an open non-composing hub without merge view', () => {
    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Today.md',
      showTodayHubCanvas: true,
      todayHubSettings,
    }).scrollTodayHubLayout).toBe(true);

    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Today.md',
      showTodayHubCanvas: true,
      todayHubSettings,
      composingNewEntry: true,
    }).scrollTodayHubLayout).toBe(false);

    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Today.md',
      showTodayHubCanvas: true,
      todayHubSettings,
      mergeView: {kind: 'diskConflict', baseUri: '/vault/Today.md', diskMarkdown: 'disk'},
    }).scrollTodayHubLayout).toBe(false);
  });

  it('marks frontmatter read-only when busy or selected note has a disk conflict', () => {
    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      busy: true,
    }).frontmatterReadOnly).toBe(true);

    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Note.md',
      diskConflict: {uri: '/vault/Note.md'},
    }).frontmatterReadOnly).toBe(true);

    expect(buildVaultTabEditorPaneDerived({
      ...baseInput,
      selectedUri: '/vault/Other.md',
      diskConflict: {uri: '/vault/Note.md'},
    }).frontmatterReadOnly).toBe(false);
  });
});
