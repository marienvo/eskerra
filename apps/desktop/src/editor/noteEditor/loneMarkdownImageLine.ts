export type LoneMarkdownImage = {
  alt: string;
  src: string;
};

/**
 * If the line is only a single Markdown image (optional surrounding whitespace), returns alt and src.
 * Used for inline preview of pasted vault images like `![Image](../Assets/Attachments/x.png)`.
 */
export function parseLoneMarkdownImageLine(lineText: string): LoneMarkdownImage | null {
  const trimmed = lineText.trim();
  const m = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!m) {
    return null;
  }
  const src = m[2].trim();
  if (src === '') {
    return null;
  }
  return {alt: m[1], src};
}
