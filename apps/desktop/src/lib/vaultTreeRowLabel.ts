import type {VaultTreeItemData} from './vaultTreeLoadChildren';

const VAULT_TREE_ARTICLE_SUFFIX = /\.md$/i;

/**
 * Human-visible label for a vault tree row. Markdown notes omit the `.md` suffix; folders keep full names.
 */
export function vaultTreeRowLabel(data: VaultTreeItemData): string {
  if (data.kind !== 'article') {
    return data.name;
  }
  return data.name.replace(VAULT_TREE_ARTICLE_SUFFIX, '');
}
