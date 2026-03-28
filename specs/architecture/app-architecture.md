# Notebox MVP: Architecture

## Application shape

Keep architecture intentionally small and explicit:

- `App.tsx` bootstraps initial route resolution and renders the root navigator.
- `RootStack` gates onboarding (`Setup`) vs. app shell (`MainTabs`).
- `MainTabs` hosts five feature stacks: Podcasts, Playlist, Vault, Note (`AddNoteTab`), Settings.
- `VaultProvider` stores selected SAF URI and current settings for all features.
- `NotesProvider` stores shared Inbox note list state for Inbox and Vault.
- `core/storage/noteboxStorage.ts` owns all SAF note and settings operations.

This keeps business logic near features while keeping device/storage logic centralized.

## App flow

```text
App launch
  -> read "notesDirectoryUri" from AsyncStorage
    -> missing: SetupScreen
    -> present: hasPermission(uri)?
        -> false: SetupScreen
        -> true: load MainTabs + hydrate VaultProvider
```

```text
SetupScreen
  -> Choose Notes Directory
  -> openDocumentTree(true)
  -> save URI in AsyncStorage
  -> init .notebox/settings.json
  -> set VaultProvider session
  -> navigate MainTabs (Vault tab)
```

```text
AddNoteScreen (Vault + button or Note tab)
  -> compose markdown note
  -> create .md note through core/storage
  -> create note in selected directory's /Inbox folder
  -> auto-create /Inbox when missing
  -> note appears in Vault immediately through shared notes state
  -> background reconcile refreshes from SAF and re-syncs generated index
```

```text
VaultScreen
  -> show one folder context (hardcoded: Inbox)
  -> list markdown files in selected SAF directory's /Inbox folder
  -> each row shows title and a relative last-modified label (not the raw file URI)
  -> open NoteDetailScreen to render markdown
```

```text
SettingsScreen
  -> edit display name in .notebox/settings.json
  -> optional "Change directory" clears URI and routes to Setup
```

## Navigation topology

```text
RootStack
├── Setup
└── MainTabs
    ├── PlaylistStack -> Playlist
    ├── PodcastsStack -> Podcasts
    ├── AddNoteStack -> AddNote
    ├── VaultStack -> Vault, NoteDetail
    └── SettingsStack -> Settings
```

## Visual design

- **Accent color** for UI highlights and progress (including the Podcasts header refresh strip): `#4FAFE6`. See [accent colors](../design/accent-colors.md).

## Source layout (feature-first)

```text
src/
├── core/
│   ├── bootstrap/resolveInitialRoute.ts
│   ├── storage/
│   │   ├── appStorage.ts
│   │   ├── keys.ts
│   │   └── noteboxStorage.ts
│   └── vault/{VaultContext,NotesContext}.tsx
├── features/
│   ├── setup/screens/SetupScreen.tsx
│   ├── inbox/screens/PlaylistScreen.tsx
│   ├── podcasts/
│   │   ├── screens/PodcastsScreen.tsx
│   │   └── services/playbackService.ts
│   ├── vault/
│   │   ├── hooks/useNotes.ts
│   │   └── screens/{VaultScreen,NoteDetailScreen}.tsx
│   └── settings/
│       ├── hooks/useSettings.ts
│       └── screens/SettingsScreen.tsx
├── navigation/
│   ├── MainTabNavigator.tsx
│   ├── RootNavigator.tsx
│   └── types.ts
└── types.ts
```

## Android directory ownership model

- The selected Notes directory is user-owned external/shared storage.
- App-owned settings live in `/.notebox/settings.json` under that directory.
- Notes are `.md` files in the selected directory's `/Inbox` folder and are the source of truth.
- App sandbox storage (AsyncStorage) stores only `notesDirectoryUri`.

This matches your requirement: after setup, app settings/state live inside the selected Notes directory dot folder whenever possible.

## `General/Inbox.md` (machine-generated index)

- The app maintains `General/Inbox.md` as a **generated** file. It is **not** a hand-authored source of truth.
- The canonical source for which notes exist is always the **current directory listing** of `Inbox/` (markdown files only, same rules as the Vault Inbox list: `.md` only, sync-conflict file names excluded).
- On each successful refresh of the Vault note list (including pull-to-refresh), after creating a new Inbox note, and whenever the app triggers the same refresh path after saving note content, the app **overwrites** `General/Inbox.md` with a bullet list of wiki-style links (`[[Inbox/<stem>|<stem>]]`, no `.md` in the link path or label).
- Any manual edits to `General/Inbox.md` are **lost** the next time the app regenerates the file.
- Mutation sync behavior for create/edit/delete is defined in [`specs/architecture/vault-notes-optimistic-sync.md`](vault-notes-optimistic-sync.md).

## Podcast file conventions

`General/` contains two podcast markdown file types with different responsibilities.

- `YYYY [Label] - podcasts.md` is the source of truth for podcast episodes shown in the app feed.
- `📻 [Title].md` is a podcast config/cache file. The app reads frontmatter from this file to resolve `rssFeedUrl` for artwork and metadata lookups.
- The app must not read `📻 [Title].md` body lines as feed episodes. Body content may exist as cache output, but it is not a feed input.

An episode may appear in the feed only when it originates from a `YYYY [Label] - podcasts.md` file.
