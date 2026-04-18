import {calmEditorial} from './calmEditorial.ts';
import {desktopBrand} from './desktopBrand.ts';

/**
 * Markdown link colors for **read-only** vault note views (mobile reader today; desktop preview /
 * reader can adopt the same contract).
 *
 * - **internalNote** — wiki links and relative `.md` links that open another vault note (desktop parity: “red” interactive).
 * - **externalSite** — `http(s)://`, `mailto:`, and wiki targets that resolve to a browser URL (desktop parity: accent blue).
 *
 * `desktopBrand.interactiveText` and `calmEditorial.accent` are tuned for **light** editorial surfaces;
 * on **dark** reader chrome those same hues read too heavy. The `dark` pair lifts luminance while
 * keeping the same red-vs-blue semantics.
 *
 * Authoritative prose + contrast notes: `specs/design/vault-readonly-link-colors.md`
 */
export const vaultReadonlyLinks = {
  light: {
    /** Same value as `desktopBrand.interactiveText` (canonical internal link red on light surfaces). */
    internalNote: desktopBrand.interactiveText,
    /** Same value as `calmEditorial.accent` (canonical external / browser link blue). */
    externalSite: calmEditorial.accent,
  },
  dark: {
    /** Brighter coral: readable on ~#121212–#1e1e1e reader backgrounds without muddying the red cue. */
    internalNote: '#FF8A82',
    /** Brighter sky: pairs with dark surfaces; distinct from internal coral. */
    externalSite: '#7DCCFF',
  },
} as const;

export type VaultReadonlyLinkScheme = keyof typeof vaultReadonlyLinks;

export type VaultReadonlyMarkdownLinkColors = {
  internalNote: string;
  externalSite: string;
};

/**
 * Resolved pair for RN `StyleSheet` / `Text` `color`, or for wiring into markdown rule options.
 */
export function vaultReadonlyMarkdownLinkColors(
  scheme: VaultReadonlyLinkScheme,
): VaultReadonlyMarkdownLinkColors {
  return vaultReadonlyLinks[scheme];
}

/**
 * Maps UI color mode strings (e.g. Gluestack `useColorMode()`) to a vault readonly link scheme.
 */
export function vaultReadonlyLinkSchemeFromColorMode(colorMode: string | null | undefined): VaultReadonlyLinkScheme {
  return colorMode === 'dark' ? 'dark' : 'light';
}
