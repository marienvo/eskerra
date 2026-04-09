import {CalendarRange,  FileText, Folder, FolderOpen} from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from 'react';

import {FILE_TREE_ICON_SIZE_PX, FILE_TREE_INDENT_PX} from './fileTreeConstants';
import styles from './FileTreeNode.module.css';
import type {TreeNodeType} from './treeNodeTypes';

const ICON = {
  size: FILE_TREE_ICON_SIZE_PX,
  strokeWidth: 1.5 as const,
};

function RowIcon({
  treeType,
  isFolderExpanded,
}: {
  treeType: TreeNodeType;
  isFolderExpanded: boolean;
}) {
  if (treeType === 'today') {
    return <CalendarRange {...ICON} aria-hidden />;
  }
  if (treeType === 'folder') {
    return isFolderExpanded
      ? <FolderOpen {...ICON} aria-hidden />
      : <Folder {...ICON} aria-hidden />;
  }
  return <FileText {...ICON} aria-hidden />;
}

export type FileTreeNodeProps = {
  depth: number;
  label: string;
  treeType: TreeNodeType;
  /** When `treeType === 'folder'`, whether the folder is expanded in the tree. */
  isFolderExpanded: boolean;
  selected: boolean;
  rightSlot?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'>;

export const FileTreeNode = forwardRef<HTMLButtonElement, FileTreeNodeProps>(
  function FileTreeNode(
    {
      depth,
      label,
      treeType,
      isFolderExpanded,
      selected,
      rightSlot,
      className,
      style,
      ...buttonProps
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        data-selected={selected ? 'true' : 'false'}
        className={[styles.row, className].filter(Boolean).join(' ')}
        style={{...style, paddingInlineStart: depth * FILE_TREE_INDENT_PX}}
        {...buttonProps}
      >
        <span className={styles.iconCell}>
          <RowIcon treeType={treeType} isFolderExpanded={isFolderExpanded} />
        </span>
        <span
          className={[
            styles.label,
            treeType === 'today' ? styles.labelToday : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {label}
        </span>
        {rightSlot ? <span className={styles.rightSlot}>{rightSlot}</span> : null}
      </button>
    );
  },
);
