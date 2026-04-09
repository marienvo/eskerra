import type {TreeNode} from './treeNodeTypes';

export type VisibleTreeRow = {
  id: string;
  depth: number;
  node: TreeNode;
  /** True when the node has a non-empty `children` array. */
  hasChildren: boolean;
};

/**
 * Depth-first visible rows from static tree roots, honoring `expandedIds`.
 * Matches the flat pattern used by the production virtualized vault tree.
 */
export function flattenVisibleTree(
  roots: readonly TreeNode[],
  expandedIds: ReadonlySet<string>,
): VisibleTreeRow[] {
  const out: VisibleTreeRow[] = [];

  const walk = (nodes: readonly TreeNode[], depth: number) => {
    for (const node of nodes) {
      const kids = node.children;
      const hasChildren = Boolean(kids && kids.length > 0);
      out.push({id: node.id, depth, node, hasChildren});
      if (hasChildren && expandedIds.has(node.id)) {
        walk(kids!, depth + 1);
      }
    }
  };

  walk(roots, 0);
  return out;
}

/** Parent URI/id map for keyboard navigation (null = root/top). */
export function buildTreeParentMap(
  roots: readonly TreeNode[],
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const walk = (nodes: readonly TreeNode[], parentId: string | null) => {
    for (const n of nodes) {
      map.set(n.id, parentId);
      if (n.children?.length) {
        walk(n.children, n.id);
      }
    }
  };
  walk(roots, null);
  return map;
}
