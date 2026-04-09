import {useCallback, useMemo, useState} from 'react';

import {buildTreeParentMap, flattenVisibleTree, type VisibleTreeRow} from './flattenVisibleTree';
import type {TreeNode} from './treeNodeTypes';

export type UseFileTreeStateOptions = {
  /** Roots of the static tree (single synthetic root or multiple). */
  roots: TreeNode[];
  /** Initial expanded node ids. */
  initialExpandedIds?: readonly string[];
  /** Initial selection (multi-select supported). */
  initialSelectedIds?: readonly string[];
};

export type UseFileTreeStateResult = {
  expandedIds: ReadonlySet<string>;
  selectedIds: readonly string[];
  visibleRows: VisibleTreeRow[];
  toggleExpanded: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  setSelectedIds: (ids: readonly string[] | string[]) => void;
  /** ArrowUp / ArrowDown move a single selection along visible rows. */
  moveSelection: (delta: 1 | -1) => void;
  /** Left: collapse expanded folder or jump to parent. Right: expand folder or no-op. */
  handleHorizontalKey: (dir: 'left' | 'right') => void;
};

export function useFileTreeState(options: UseFileTreeStateOptions): UseFileTreeStateResult {
  const {roots, initialExpandedIds = [], initialSelectedIds = []} = options;
  const [expandedIds, setExpandedIds] = useState(() => new Set<string>(initialExpandedIds));
  const [selectedIds, setSelectedIds] = useState<string[]>([...initialSelectedIds]);

  const visibleRows = useMemo(
    () => flattenVisibleTree(roots, expandedIds),
    [roots, expandedIds],
  );

  const parentById = useMemo(() => buildTreeParentMap(roots), [roots]);

  const rowById = useMemo(() => {
    const m = new Map<string, VisibleTreeRow>();
    for (const row of visibleRows) {
      m.set(row.id, row);
    }
    return m;
  }, [visibleRows]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const collapse = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const moveSelection = useCallback(
    (delta: 1 | -1) => {
      if (visibleRows.length === 0) {
        return;
      }
      const primary = selectedIds[0];
      const idx = primary ? visibleRows.findIndex(r => r.id === primary) : -1;
      const start = idx >= 0 ? idx : 0;
      const nextIdx = Math.max(0, Math.min(visibleRows.length - 1, start + delta));
      setSelectedIds([visibleRows[nextIdx]!.id]);
    },
    [selectedIds, visibleRows],
  );

  const handleHorizontalKey = useCallback(
    (dir: 'left' | 'right') => {
      const primary = selectedIds[0];
      if (!primary) {
        return;
      }
      const row = rowById.get(primary);
      if (!row) {
        return;
      }
      if (dir === 'right') {
        if (row.node.type === 'folder' && row.hasChildren) {
          if (!expandedIds.has(primary)) {
            expand(primary);
          }
        }
        return;
      }
      // left
      if (row.node.type === 'folder' && row.hasChildren && expandedIds.has(primary)) {
        collapse(primary);
        return;
      }
      const parentId = parentById.get(primary);
      if (parentId != null) {
        setSelectedIds([parentId]);
      }
    },
    [selectedIds, rowById, expandedIds, expand, collapse, parentById],
  );

  const setSelectedIdsPublic = useCallback((ids: readonly string[] | string[]) => {
    setSelectedIds([...ids]);
  }, []);

  return {
    expandedIds,
    selectedIds,
    visibleRows,
    toggleExpanded,
    expand,
    collapse,
    setSelectedIds: setSelectedIdsPublic,
    moveSelection,
    handleHorizontalKey,
  };
}
