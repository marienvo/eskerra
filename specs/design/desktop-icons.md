# Desktop app icons

## Material Icons

The desktop app (Vite + React) uses **Google Material Icons** via the `material-icons` npm package (webfont). Icon names and the glyph set match **`react-native-vector-icons/MaterialIcons`** on Android, so the same ligature names apply (for example `radio`, `notes`, `settings`).

- Import the font once at app entry (currently `apps/desktop/src/main.tsx`):  
  `import 'material-icons/iconfont/filled.css';`  
  (Use the `filled` stylesheet only so the bundle does not pull in outlined/round/sharp webfonts.)
- Render icons with the shared `MaterialIcon` component in `apps/desktop/src/components/MaterialIcon.tsx`, or a `<span className="material-icons">` with the same sizing rules below.

## 24px grid (required)

All Material Icons in the desktop app **must be rendered on a square whose width and height are a positive integer multiple of 24 CSS pixels** (24×24, 48×48, 72×72, …). This keeps icons aligned to the same raster grid as the default Material Icons optical size and avoids blurry scaling.

- Set **`font-size`** (and the icon box **`width` / `height`** when using `MaterialIcon`) to that multiple of 24.
- Do not use odd sizes such as 22px or 28px for Material Icons unless you have an exceptional case and document the exception in code review.

The `MaterialIcon` component only accepts sizes typed as `DesktopMaterialIconSizePx` (multiples of 24 up to 192) and logs a **development** error if a non-multiple slips through.
