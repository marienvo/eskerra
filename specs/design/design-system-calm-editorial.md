# Calm Editorial Blue (design system)

Visual language: calm, high-contrast, warm editorial surfaces—**Financial Times meets Notion**, slightly modern. Color supports **navigation and semantics**, not decoration. **No** loud gradients, neon, or rainbow note labels.

**Default product chrome:** light only. **Do not** follow `prefers-color-scheme` until dark mode is a supported feature; reserved dark tokens are documented for future implementation.

**Platforms:** Tokens and rules apply to **desktop and mobile**. Desktop may implement first; mobile should converge on these names and hex values.

## Principles

1. **60-30-10:** ~60% neutrals (background, surfaces, text), ~30% structure (borders, secondary text), ~10% or less **accent** (`accent`).
2. **Avoid pure white (`#FFFFFF`) as the only long-form reading surface.** Use warm off-white for editors and long reading where possible.
3. **Semantic color is functional:** recording, saved/synced, draft, warning—not cosmetics per note or folder.
4. **Capture vs Consume:** Same app, two mental spaces:
   - **Capture** (notes, recordings): quiet, minimal, light, low visual noise.
   - **Consume** (podcasts, news): slightly denser contrast; room for artwork; still professional (no gimmicks).
5. **Focus** must be visible and calm (`:focus-visible`), not buried.

## Token table (US English names)

| Token | Hex | Use |
| --- | --- | --- |
| `background` | `#F7F6F3` | App shell, default page background |
| `surface` | `#FFFFFF` | Panels, cards, modals (short durations) |
| `textPrimary` | `#111111` | Primary body and titles |
| `textSecondary` | `#6B6B6B` | Secondary labels, metadata, hints |
| `border` | `#E5E3DF` | Dividers, default borders |
| `accent` | `#4FAFE6` | Primary actions, links, key emphasis (~10% of UI) |
| `accentHover` | `#3A97CC` | Hover/active border or fill shift for accent controls |
| `accentSubtleBg` | `#EAF6FD` | Selected row, subtle accent wash |
| `editorBackground` | `#F7F6F3` | Long-form editor surface (may match `background`) |
| `editorText` | `#111111` | Editor foreground |
| `semanticRecording` | `#E35D5D` | **Active recording only** (soft red, not alarm red) |
| `semanticSuccess` | `#5FAF7A` | Saved, synced, success states |
| `semanticWarning` | `#D9A441` | Non-blocking cautions |
| `semanticDraft` | `#6B6B6B` | Draft / unsaved-quiet state (text or icon; optional muted border) |

### Danger / errors (separate from `semanticRecording`)

Use for failed operations, validation errors, and error banners. Prefer a **sober** red, not the same urgency as “recording on”:

| Token | Hex | Use |
| --- | --- | --- |
| `danger` | `#9E3A3A` | Error text, icons |
| `dangerSurface` | `#FDEDEC` | Error banner / inline alert background |
| `dangerBorder` | `#E8C4C4` | Error banner border |

Accessibility: verify contrast for `danger` on `surface` and white/light surfaces; adjust if product contrast rules require it.

## Capture vs Consume (implementation)

- **Capture** uses foundation tokens on `:root` (default).
- **Consume** (e.g. desktop podcasts tab only): apply `data-app-surface="consume"` on a **container that wraps only that feature’s content**—not the global title bar or capture rail. Scoped CSS overrides local custom properties (e.g. slightly darker `surface`, stronger `border`) so artwork and lists read clearly without changing the whole window.

## CSS custom property convention (desktop reference)

Implementations map spec tokens to variables, for example:

- `--color-bg` → `background`
- `--color-surface` → `surface`
- `--color-text` → `textPrimary`
- `--color-muted` → `textSecondary`
- `--color-border` → `border`
- `--color-primary` / `--color-accent` → `accent` (keep `primary` only if legacy; prefer `accent` in new code)
- `--color-editor-bg` / `--color-editor-text` → editor tokens
- `--color-semantic-*` → semantic row

## Future dark mode (not implemented)

Reserved for when dark mode is explicitly supported—**do not** wire `prefers-color-scheme` until then:

| Role | Hex |
| --- | --- |
| Background | `#0F1113` |
| Surface | `#171A1D` |
| Text | `#E6E6E6` |
| Accent | `#4FAFE6` |

## Related

- Accent shortcut: [accent-colors.md](accent-colors.md)
- Desktop brand (shell-first): [brand-tokens-desktop.md](brand-tokens-desktop.md)
- Desktop WebKit text typography: [desktop-text-rendering.md](desktop-text-rendering.md)
- Mobile constant: `apps/mobile/src/core/ui/accentColor.ts` should stay aligned with `accent`.
