export type TreeNodeType = 'today' | 'folder' | 'file';

export type TreeNode = {
  id: string;
  name: string;
  type: TreeNodeType;
  children?: TreeNode[];
};
