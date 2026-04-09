/** IDE-style vault file tree row height; keep virtualizer estimateSize in sync. */
export const FILE_TREE_ROW_HEIGHT_PX = 26;

/**
 * Lucide default viewBox is 24×24. Using 24 CSS pixels gives 1:1 stroke rasterization; 20px scales
 * by 5/6 and keeps thin strokes between device pixels (looks soft even when the SVG bbox is
 * integer-aligned).
 */
export const FILE_TREE_ICON_SIZE_PX = 24;

/** Indentation step per depth level (CSS pixels). */
export const FILE_TREE_INDENT_PX = 16;
