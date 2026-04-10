import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {fileTreeExampleData} from './fileTreeExampleData';
import {useFileTreeState} from './useFileTreeState';

describe('useFileTreeState', () => {
  it('expands and flattens visible rows', () => {
    const {result} = renderHook(() =>
      useFileTreeState({
        roots: fileTreeExampleData,
        initialExpandedIds: ['root'],
      }),
    );

    expect(result.current.visibleRows.map(r => r.id)).toEqual([
      'root',
      'today-hub',
      'inbox',
      'readme',
    ]);

    act(() => {
      result.current.expand('inbox');
    });

    expect(result.current.visibleRows.map(r => r.id)).toEqual([
      'root',
      'today-hub',
      'inbox',
      'note-a',
      'note-b',
      'readme',
    ]);
  });

  it('moves selection along visible rows', () => {
    const {result} = renderHook(() =>
      useFileTreeState({
        roots: fileTreeExampleData,
        initialExpandedIds: ['root'],
        initialSelectedIds: ['today-hub'],
      }),
    );

    act(() => {
      result.current.moveSelection(1);
    });
    expect(result.current.selectedIds).toEqual(['inbox']);
  });

  it('collapses folder on left key when expanded', () => {
    const {result} = renderHook(() =>
      useFileTreeState({
        roots: fileTreeExampleData,
        initialExpandedIds: ['root', 'inbox'],
        initialSelectedIds: ['inbox'],
      }),
    );

    act(() => {
      result.current.handleHorizontalKey('left');
    });
    expect(result.current.expandedIds.has('inbox')).toBe(false);
  });
});
