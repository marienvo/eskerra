# Desktop companion shell patterns

Conventions for the **primary** Notebox desktop window (`apps/desktop`). Settings and other surfaces may use a **separate Tauri window**; this document is about the main shell.

## No modal overlays in the main window

Do **not** add **centered dialogs** on a **dimmed full-window backdrop** for flows inside the main UI. Prefer one of:

- **Panes** in the existing resizable layout (for example the Inbox **Editor** column).
- **Inline** UI in the current view.
- A **secondary window** when a detached surface is genuinely needed.

This avoids focus traps, stacking issues, and keeps behavior aligned with the pane-based layout.

## Inbox: new log entry

Creating a new inbox note uses the **same Editor pane UI** as editing (single multiline field + footer primary action), in **compose** mode:

- Pane header title: **New entry**.
- Trailing control: **Material `clear`**, ghost icon button (same treatment as **Add entry** in the Log header), to **cancel** compose without saving.
- **Compose model** matches the Android **Add note** screen: the **first line** is the title (drives the **`.md` filename stem** via `sanitizeFileName`); the rest is body. On save, the file is written as `# Title` + body, using **`parseComposeInput`**, **`buildInboxMarkdownFromCompose`**, and related helpers from **`@notebox/core`** (shared with the mobile app).
