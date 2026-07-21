# lwriter — Architecture

## Overview

```
lwriter/
├── DESIGN.md              # visual/UX spec, design tokens
├── PROGRESS.md            # phase checklist & status log
├── ARCHITECTURE.md        # this file
├── SETUP.md               # build & run instructions
├── ui/                    # static frontend (vanilla HTML/CSS/JS, no bundler)
│   ├── index.html
│   ├── styles.css
│   ├── app.js             # main controller, keyboard shortcuts, Tauri bridge
│   └── markdown.js        # syntax-highlight engine → backdrop layer
└── src-tauri/             # Rust backend (Tauri 2 shell)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs        # entry point
        └── lib.rs         # Tauri commands (file I/O, dialogs)
```

## Frontend ↔ backend communication

Uses Tauri 2's `window.__TAURI_INTERNALS__.invoke` bridge (no npm wrappers, `withGlobalTauri: true` set in config).

```
JS (ui/app.js)                    Rust (src-tauri/src/lib.rs)
─────────────────                 ──────────────────────────
invoke('read_file', { path })  →  #[tauri::command] fn read_file(...)
invoke('open_file_dialog')     →  #[tauri::command] async fn open_file_dialog()
                                 → spawns rfd native dialog
invoke('confirm_discard', ...) →  #[tauri::command] async fn confirm_discard()
                                 → spawns rfd message dialog
invoke('list_notes')           →  #[tauri::command] fn list_notes()
                                 → lists .md/.txt in Documents\lwriter (auto-created),
                                   returns { name, path, modified, subdir } newest-first
invoke('list_folder_notes')    →  #[tauri::command] fn list_folder_notes(path)
                                 → recursive listing of any linked folder (Obsidian
                                   vault); skips dot-dirs, depth ≤ 8, ≤ 1000 notes
invoke('open_folder_dialog')   →  #[tauri::command] async fn open_folder_dialog()
                                 → native folder picker (rfd)
invoke('delete_note', ...)     →  #[tauri::command] fn delete_note(path)
                                 → system Recycle Bin (trash crate)
invoke('rename_note', ...)     →  #[tauri::command] fn rename_note(path, new_name)
invoke('move_note', ...)       →  #[tauri::command] fn move_note(path, dest_dir)
                                 → collision-safe; copy+delete fallback across drives
invoke('show_in_explorer', ..) →  #[tauri::command] fn show_in_explorer(path)
invoke('get_notes_dir')        →  #[tauri::command] fn get_notes_dir()
invoke('save_image', ...)      →  #[tauri::command] fn save_image(dir, name, data)
                                 → writes pasted image bytes (base64) next to the
                                   note, collision-safe; returns the file name
invoke('import_image', ...)    →  #[tauri::command] fn import_image(dir, src_path)
                                 → copies a dropped image file next to the note
invoke('read_image', ...)      →  #[tauri::command] fn read_image(path)
                                 → image file as a data: URI for the preview pane
```

- File I/O is Rust-side only (no filesystem access from JS).
- Dialogs use `rfd` directly (spawned on a blocking thread via `spawn_blocking`).
- Window controls (min/max/close/drag) use Tauri's built-in `@tauri-apps/api/window`.

## Editor layering

```
┌────────────────────────────────────────┐
│ <div id="editor-wrapper">              │
│   ┌──────────────────────────────────┐ │
│   │ <div id="backdrop">  (hidden)    │ │  ← styled markdown HTML,
│   │   <p><span class="md-h1">#</span>│ │     identical font metrics
│   │   <span class="md-h1">Heading    │ │     to textarea
│   │   </span></p>                    │ │
│   └──────────────────────────────────┘ │
│   ┌──────────────────────────────────┐ │
│   │ <textarea id="editor">           │ │  ← transparent text,
│   │   # Heading                      │ │     native caret + IME
│   └──────────────────────────────────┘ │
│ └──────────────────────────────────────┘
```

Both layers share identical `font-family`, `font-size`, `line-height`, `padding`,
`letter-spacing`, and `word-spacing`. textarea has `color: transparent` (caret stays
visible via `caret-color`). Scrolling is synced via the `scroll` event.

`markdown.js` runs on every input event, parses the textarea content line-by-line
with simple regex, and rewrites `backdrop.innerHTML`. Only the visible viewport is
rendered for large files.

## Theme system

CSS custom properties on `:root` (light) and `:root.dark`. A `data-theme` attribute
tracks the current mode. JS reads `window.matchMedia('(prefers-color-scheme: dark)')`
for system detection and persists user override to localStorage.

## State

All editor state lives in a plain JS object (`appState`) in `app.js`:
- `filePath: string | null` — current file path (null = unsaved)
- `fileName: string` — display name ("Untitled" default)
- `dirty: boolean` — unsaved changes flag
- `content: string` — current editor text
- `theme: 'system' | 'light' | 'dark'`
- `fontSize: number` — default 18
- `typewriterMode: boolean`
- `focusMode: boolean`
- `previewMode: boolean`
