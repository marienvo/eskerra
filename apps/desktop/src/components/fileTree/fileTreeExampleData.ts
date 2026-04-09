import type {TreeNode} from './treeNodeTypes';

/** Static sample tree for tests and future dev-only demos. */
export const fileTreeExampleData: TreeNode[] = [
  {
    id: 'root',
    name: 'Vault',
    type: 'folder',
    children: [
      {
        id: 'today-hub',
        name: 'Journal',
        type: 'today',
      },
      {
        id: 'inbox',
        name: 'Inbox',
        type: 'folder',
        children: [
          {id: 'note-a', name: 'Meeting notes.md', type: 'file'},
          {id: 'note-b', name: 'Ideas.md', type: 'file'},
        ],
      },
      {id: 'readme', name: 'README.md', type: 'file'},
    ],
  },
];
