# Desktop app icons

## Material Icons

The desktop app (Vite + React) uses **Google Material Icons** via the `material-icons` npm package (webfont). Icon names and the glyph set match **`react-native-vector-icons/MaterialIcons`** on Android, so the same ligature names apply (for example `radio`, `move_to_inbox`, `settings`).

- Import the font once at app entry (currently `apps/desktop/src/main.tsx`):  
  `import 'material-icons/iconfont/filled.css';`  
  (Use the `filled` stylesheet only so the bundle does not pull in outlined/round/sharp webfonts.)
- Render icons with the shared `MaterialIcon` component in `apps/desktop/src/components/MaterialIcon.tsx`, or a `<span className="material-icons">` with the same sizing rules below.

## 12px grid (required)

All Material Icons in the desktop app **must be rendered on a square whose width and height are a positive integer multiple of 12 CSS pixels** (12×12, 24×24, 36×36, …, up to 192). **24×24** is the usual default for standard controls; **12×12** is used for compact chrome (for example the main rail tab icons).

- Set **`font-size`** (and the icon box **`width` / `height`** when using `MaterialIcon`) to that multiple of 12.
- Do not use odd sizes such as 22px or 28px for Material Icons unless you have an exceptional case and document the exception in code review.

The `MaterialIcon` component only accepts sizes typed as `DesktopMaterialIconSizePx` and logs a **development** error if the value is outside 12–192 or not a multiple of 12.
