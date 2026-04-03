/**
 * Markdown image `src` → URL for inline preview in the editor.
 * Shell provides the implementation (for example Tauri `convertFileSrc` in `lib/`).
 */
export type VaultImagePreviewUrlResolver = (
  vaultRoot: string,
  activeNotePath: string | null,
  imageSrc: string,
) => string;

export type VaultImagePreviewRefs = {
  vaultRoot: {current: string};
  activeNotePath: {current: string | null};
  resolvePreviewUrl: VaultImagePreviewUrlResolver;
};
