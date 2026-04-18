# Vault read-only markdown link colors

Semantic colors for **wiki-style internal links** (open another note) vs **external links** (browser: `http(s)://`, `mailto:`, or wiki inner target that resolves to a URL).

## Source of truth (code)

| Artifact | Path |
|----------|------|
| Token object + helpers | `packages/eskerra-tokens/src/vaultReadonlyLinks.ts` |
| Desktop CSS custom properties | Generated `--color-vault-readonly-link-*` in `packages/eskerra-tokens/generated/desktop-root.css` (`buildDesktopRootCss()`) |

Import in apps:

```ts
import {
  vaultReadonlyMarkdownLinkColors,
  vaultReadonlyLinkSchemeFromColorMode,
} from '@eskerra/tokens';
```

## Semantics

- **internalNote** — Opens in-app: `[[Wiki]]`, relative `[label](Other.md)`, ambiguous wiki picker rows (navigation affordance; “red” family, aligned with `desktopBrand.interactiveText` on light UI).
- **externalSite** — Opens outside the vault reader: `https://…`, `mailto:…`, wiki inner text that is a browser href (“blue” family, aligned with `calmEditorial.accent` on light UI).

## Light vs dark

| Scheme | When to use | internalNote | externalSite |
|--------|----------------|----------------|--------------|
| **light** | Reader on calm editorial / light panel (`colorMode === 'light'`) | Same as `desktopBrand.interactiveText` | Same as `calmEditorial.accent` |
| **dark** | Reader on dark chrome (`colorMode === 'dark'`) | `#FF8A82` — higher luminance than desktop red on `#121212`–`#1e1e1e` | `#7DCCFF` — brighter sky than `#4FAFE6` on dark |

Rationale: the stock brand red and accent blue were chosen for **light** backgrounds. On dark reader surfaces they look muddy or too dim; the `dark` pair preserves hue separation (coral vs sky) without matching desktop shell tokens literally.

## Desktop CSS (future wiring)

`:root` exposes four variables (all values flow from `vaultReadonlyLinks` in TS):

- `--color-vault-readonly-link-internal` / `--color-vault-readonly-link-external` — default **light** reader.
- `--color-vault-readonly-link-internal-on-dark` / `--color-vault-readonly-link-external-on-dark` — use when the markdown body sits on a **dark** surface (e.g. future dark editor preview).

Example (conceptual):

```css
.vault-readonly-markdown a.internal {
  color: var(--color-vault-readonly-link-internal);
}
.vault-readonly-markdown--dark a.internal {
  color: var(--color-vault-readonly-link-internal-on-dark);
}
```

Until desktop read-only markdown consumes these variables, mobile remains the reference implementation via `vaultReadonlyMarkdownLinkColors()`.

## Accessibility

Targets are **decorative/interactive hue cues** paired with underline (mobile) or editor conventions (desktop); they are not intended as the only affordance. If a surface fails WCAG contrast for body text, prefer stronger weight, underline, or focus ring — not only darker fills of the same hue.

## Related

- Calm editorial palette: `specs/design/design-system-calm-editorial.md`
- Desktop brand anchors: `specs/design/brand-tokens-desktop.md`
- Token contract: `specs/design/design-tokens-contract.md`
