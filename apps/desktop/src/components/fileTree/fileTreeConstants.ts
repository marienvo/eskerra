/** IDE-style vault file tree row height; keep virtualizer estimateSize in sync. */
export const FILE_TREE_ROW_HEIGHT_PX = 26;

/** Radix Icons use a 15×15 viewBox; keep row `iconCell` in sync. */
export const FILE_TREE_ICON_SIZE_PX = 15;

/** Indentation step per depth level (CSS pixels). */
export const FILE_TREE_INDENT_PX = 20;

/**
 * Horizontal inset between the scroll viewport and row **content** (icon + label).
 * Padding is on the tree `<button>` with default `background-clip`, so hover/selection
 * still fills the full row width.
 */
export const FILE_TREE_ROW_EDGE_INSET_PX = 6;

/** Padding after the label toward the inner right edge (inside `EDGE_INSET`). */
export const FILE_TREE_ROW_TRAILING_PAD_PX = 8;
