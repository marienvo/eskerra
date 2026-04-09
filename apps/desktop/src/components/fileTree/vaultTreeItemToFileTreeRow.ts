import {
  vaultTreeItemShowsTodaySidebarIcon,
  type VaultTreeItemData,
} from '../../lib/vaultTreeLoadChildren';
import type {TreeNodeType} from './treeNodeTypes';

export type FileTreeRowViewModel = {
  id: string;
  treeType: TreeNodeType;
  label: string;
  depth: number;
  isExpandable: boolean;
  isExpanded: boolean;
  primaryOpenUri: string | null;
};

export function vaultTreeItemToFileTreeRowViewModel(options: {
  data: VaultTreeItemData;
  level: number;
  isExpanded: boolean;
  label: string;
  primaryOpenUri: string | null;
}): FileTreeRowViewModel {
  const {data, level, isExpanded, label, primaryOpenUri} = options;

  let treeType: TreeNodeType;
  if (data.kind === 'todayHub' || vaultTreeItemShowsTodaySidebarIcon(data)) {
    treeType = 'today';
  } else if (data.kind === 'folder') {
    treeType = 'folder';
  } else {
    treeType = 'file';
  }

  const isExpandable = data.kind === 'folder';

  return {
    id: data.uri,
    treeType,
    label,
    depth: level,
    isExpandable,
    isExpanded: isExpandable ? isExpanded : false,
    primaryOpenUri,
  };
}
