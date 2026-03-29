import {mergeInboxNoteOptimistic} from '../src/core/vault/NotesContext';
import {NoteSummary} from '../src/types';

describe('mergeInboxNoteOptimistic', () => {
  test('adds a created note and sorts by lastModified descending', () => {
    const previous: NoteSummary[] = [
      {lastModified: 10, name: 'older.md', uri: 'content://vault/older.md'},
      {lastModified: null, name: 'null.md', uri: 'content://vault/null.md'},
    ];
    const created: NoteSummary = {
      lastModified: 25,
      name: 'new.md',
      uri: 'content://vault/new.md',
    };

    const merged = mergeInboxNoteOptimistic(previous, created);
    expect(merged.map(note => note.uri)).toEqual([
      'content://vault/new.md',
      'content://vault/older.md',
      'content://vault/null.md',
    ]);
  });

  test('replaces existing note with same uri before sorting', () => {
    const previous: NoteSummary[] = [
      {lastModified: 12, name: 'same-old.md', uri: 'content://vault/same.md'},
      {lastModified: 8, name: 'other.md', uri: 'content://vault/other.md'},
    ];
    const created: NoteSummary = {
      lastModified: 20,
      name: 'same-new.md',
      uri: 'content://vault/same.md',
    };

    const merged = mergeInboxNoteOptimistic(previous, created);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(created);
    expect(merged[1].uri).toBe('content://vault/other.md');
  });
});
