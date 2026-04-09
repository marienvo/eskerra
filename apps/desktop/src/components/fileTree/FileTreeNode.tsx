import {
  ChevronDownIcon,
  ChevronRightIcon,
  DashboardIcon,
  ReaderIcon,
} from '@radix-ui/react-icons';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from 'react';

import {
  FILE_TREE_ICON_SIZE_PX,
  FILE_TREE_INDENT_PX,
  FILE_TREE_ROW_EDGE_INSET_PX,
  FILE_TREE_ROW_TRAILING_PAD_PX,
} from './fileTreeConstants';
import styles from './FileTreeNode.module.css';
import type {TreeNodeType} from './treeNodeTypes';

const ICON_DIM = {
  width: FILE_TREE_ICON_SIZE_PX,
  height: FILE_TREE_ICON_SIZE_PX,
} as const;

function RowIcon({
  treeType,
  isFolderExpanded,
}: {
  treeType: TreeNodeType;
  isFolderExpanded: boolean;
}) {
  if (treeType === 'today') {
    return <DashboardIcon {...ICON_DIM} aria-hidden />;
  }
  if (treeType === 'folder') {
    return isFolderExpanded ? (
      <ChevronDownIcon {...ICON_DIM} aria-hidden />
    ) : (
      <ChevronRightIcon {...ICON_DIM} aria-hidden />
    );
  }
  return <ReaderIcon {...ICON_DIM} aria-hidden />;
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
        style={{
          ...style,
          paddingInlineStart:
            FILE_TREE_ROW_EDGE_INSET_PX + depth * FILE_TREE_INDENT_PX,
          paddingInlineEnd:
            FILE_TREE_ROW_EDGE_INSET_PX + FILE_TREE_ROW_TRAILING_PAD_PX,
        }}
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
