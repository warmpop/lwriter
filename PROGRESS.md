# lwriter — Progress Log

> **Purpose of this file:** running log of what has been built, what's in flight, and what's
> next — so any contributor (human or AI model) can pick up exactly where work stopped.
> Update this file at the end of every work session. Newest phase status at the top of each list.

## Current status

**Phase:** 5 (macOS port) shipped as v0.2.1 (v0.2.0 was pulled — see below).
Windows build still shippable, unaffected.
Next: visual pass on-device (traffic lights, chrome padding, theme
live-follow, font metrics in WKWebView).
**Last updated:** 2026-07-21 (v0.2.0 unsigned .app was rejected by Gatekeeper
as "damaged"; v0.2.1 ad-hoc signs the bundle — see Phase 5 notes)

## Quick orientation

- Read `DESIGN.md` for the visual/UX spec and the framework decision (Tauri 2 + vanilla JS UI).
- Read `ARCHITECTURE.md` for code layout and how frontend ↔ Rust backend talk.
- Read `SETUP.md` to build and run.
- App code: `src-tauri/` (Rust shell + commands) and `ui/` (static HTML/CSS/JS frontend).

## Phase plan

### Phase 0 — Project setup ✅
- [x] Decide stack: Tauri 2, vanilla JS frontend (no bundler), Rust backend with `rfd` dialogs
- [x] Research inspiration app (write0 — https://write.omarbadri.dev/) and extract design tokens
- [x] Write DESIGN.md / SETUP.md / ARCHITECTURE.md / README / LICENSE (MIT)

### Phase 1 — Core shell ✅
- [x] Tauri scaffold: `src-tauri/` with config, capabilities, commands
- [x] Frameless window with custom title bar (drag region, min/max/close)
- [x] Editor: layered textarea + syntax-highlight backdrop (markdown-aware styling)
- [x] Light/dark theme with system detection + manual toggle
- [x] Status bar: word count, char count, reading time
- [x] First successful `cargo build` + app launches

### Phase 2 — Files ✅
- [x] Open / Save / Save As via native dialogs (Rust `rfd`)
- [x] New document, dirty-state tracking (● in title), confirm-discard on close
- [x] Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S shortcuts
- [x] Session restore (last content/path via localStorage)
- [x] Drag & drop a .txt/.md file onto the window to open it

### Phase 3 — Writing experience ✅
- [x] Markdown preview toggle (Ctrl+E) — own tiny renderer in `ui/markdown.js`, serif prose
- [x] Typewriter mode (Ctrl+T): caret line stays vertically centered
- [x] Focus mode (Ctrl+Shift+F): dim all paragraphs except the one being edited
- [x] Auto-hiding chrome: title/status bars fade while typing, return on mouse move
- [x] Ctrl+B / Ctrl+I to wrap selection in **bold** / *italic*

### Phase 4 — Polish & distribution ✅
- [x] App icon (.ico) — real multi-res icon (16→256px, 32-bit) provided by the user
  2026-07-16; lives at `src-tauri/icons/icon.ico` (source copy `icon_512x512@2x.ico`
  in the repo root), declared in `bundle.icon`, embedded in the exe (verified by
  extraction). Replaces the earlier 16×16 placeholder.
- [x] Settings persistence (theme, modes, font size) — localStorage
- [x] Design pass to match iA Writer / write0 (2026-07-12):
  - Bundled iA Writer Quattro S woff2 (`ui/fonts/`, SIL OFL license included)
  - write0-accurate palette (`#fafafa`/`#191919` bg, `#262626`/`#e5e5e5` text, blue-600/400 caret)
  - Seamless chrome: borderless title/status bars sharing the editor bg, filename centered,
    real Windows caption-button glyphs (SVG) incl. restore state, double-click-to-maximize
  - iA-style markdown: headings bold in text color (not tinted), syntax chars muted gray
  - Chrome fades while typing (0.6s), returns on mouse move
- [x] Theme follows Windows app theme **live** — matchMedia + Tauri `onThemeChanged`
  (verified by flipping `AppsUseLightTheme` while running; needed `core:window:allow-theme`)
- [x] Bug fixes found during the pass:
  - Backdrop lines were joined with `\n` inside a `pre-wrap` container → phantom line boxes / layer drift
  - `.md-code` horizontal padding shifted glyphs out of caret alignment
  - Typewriter mode scrolled the (non-scrolling) textarea → now scrolls `#editor-area`,
    caret Y measured with a hidden mirror div (handles soft-wrapped lines)
  - Shortcuts were bound to the textarea, so Ctrl+E couldn't exit preview → moved to document
  - Ctrl+B/I destroyed the native undo stack → now uses `execCommand('insertText')`
  - Saved typewriter/focus settings were loaded but never applied on startup
  - Code spans were HTML-escaped twice (editor backdrop and preview)
- [x] Notes sidebar (2026-07-12): panel icon top-left / **Ctrl+\** (Notion-style;
  Ctrl+B stays bold) slides in a write0-style list of .md/.txt files from the notes
  library `Documents\lwriter` (auto-created), with relative modified dates ("3h ago").
  Backed by new Rust command `list_notes`; Save dialog defaults new files into the library.
  Sidebar visibility persists across sessions (hidden on first run).
- [x] Font picker (2026-07-12): "Aa" button in the titlebar. JetBrains Mono
  (bundled, new default), iA Writer Quattro, Georgia, Times New Roman. Proportional
  fonts get color-only markdown styling — bold/italic glyph widths would drift the
  backdrop off the caret (`:root.proportional-font` overrides in styles.css).
- [x] Tab fix (2026-07-13): Tab was doing browser focus-navigation into the
  titlebar buttons. Now Tab indents (4 spaces), Shift+Tab outdents, multi-line
  selections indent/outdent line-wise — all via `execCommand('insertText')` so undo
  survives. All chrome buttons got `tabindex="-1"` so focus can't leave the editor.
- [x] Settings modal (2026-07-13): cog at the bottom of the sidebar opens a
  write0-style dialog (Esc / click-outside / ✕ closes). Sections:
  appearance (theme, editor font, font size stepper, line width narrow/normal/wide,
  line spacing compact/normal/relaxed), writing (typewriter, focus, spellcheck,
  hide-bars-while-typing toggles), notes ("open folder" → new Rust command
  `open_notes_dir` spawns Explorer), and a keyboard-shortcuts reference.
  All values persist in localStorage; keyboard shortcuts and modal stay in sync
  (`syncSettingsUI`). New settings: `editorWidth`, `lineSpacing`, `spellcheck`,
  `chromeAutoHide`. Built clean; visual check pending (user was mid-session).
- [x] Highlighter crash fix (2026-07-13): `splitApply()` in markdown.js read
  `seg.text` off already-rendered HTML segments (undefined) → TypeError → the whole
  backdrop render died → transparent textarea text appeared to vanish. Triggered by ANY
  completed inline markup (italic, bold, code, links, strikethrough). Now HTML segments
  pass through untouched. Regression-tested via node against all inline combinations.
  Also: strikethrough got a real .md-strike style (line-through, secondary color).
- [x] Sidebar keybind is now **Ctrl+D** (was Ctrl+\) — user preference. Updated tooltip,
  settings shortcut grid, DESIGN.md.
- [x] Default note (2026-07-13): notes library now seeds a single
  "lwriter guide.md" (markdown tour + full shortcut list) when `notes_dir()` first
  creates Documents\lwriter. ideas.md/welcome.md removed from the existing library.
- [x] Ctrl+N sidebar behavior (2026-07-13): new note auto-closes the sidebar;
  while a document is unsaved (filePath null) the sidebar shows it as a pinned
  "Untitled / unsaved — Ctrl+S to keep it" row, since only saved files exist in the
  Documents\lwriter listing.
- [x] Discard-dialog fix (2026-07-13): "Discard changes?" OK button did nothing —
  rfd's Windows backend falls back to a plain OK/Cancel MessageBox and reports `Ok`,
  while the code only accepted `Custom("Discard")`. Now matches Ok/Yes/Custom("Discard").
- [x] Linked folders / Obsidian vaults (2026-07-13): folder-plus button in the
  sidebar header links any folder (native picker via new `open_folder_dialog`). Each
  linked folder renders as a collapsible section (chevron header, note count, hover ×
  to unlink — nothing deleted) under the notes library. New Rust command
  `list_folder_notes` walks the folder recursively (skips dot-dirs like `.obsidian`/
  `.git`, depth ≤ 8, capped at 1000 notes), returns `subdir` shown in the row's date
  line. Files are edited in place, so a vault stays fully Obsidian-compatible —
  swap between apps freely. Links + collapsed state persist in localStorage.
- [x] Sidebar context menus (2026-07-13): stock WebView2 right-click menu is
  suppressed everywhere except the editor/preview (native cut/copy/paste/spellcheck
  kept there). Sidebar right-click is context-aware:
  - note → open · rename (inline input, Enter/Esc/blur) · show in explorer · archive
    (moves to `<root>\archive`, which listings skip) · move to <library/vault> ·
    delete (system Recycle Bin via new `trash` crate dep — recoverable, no confirm)
  - folder header → expand/collapse · show in explorer · unlink
  - empty space → new note · link a folder… · open notes folder · refresh
  New Rust commands: `delete_note`, `rename_note` (sanitizes Windows-invalid chars,
  keeps extension), `move_note` (creates dest, collision-safe "name 2.md", copy+delete
  fallback across drives), `show_in_explorer` (/select for files), `get_notes_dir`.
  If the open note is deleted/renamed/moved, editor state follows (delete → buffer
  becomes unsaved Untitled). Added toast component for transient feedback.
- [x] Archived section (2026-07-13): archives are no longer disk-only — a
  collapsible "archived" section (folded by default, hidden when empty) sits at the
  bottom of the sidebar, aggregating `<root>\archive` of the library and every linked
  folder, each row labeled with its source. Right-click an archived note → "unarchive"
  (replaces "archive"; moves back to its root). Collapsed state persists
  (`archiveCollapsed`). No new Rust — reuses `list_folder_notes` on the archive dirs.
- [x] Settings button moved (2026-07-13): sidebar footer removed; a proper
  Lucide-style gear icon now sits next to the link-folder button in the sidebar
  header (`.sidebar-tool` shared style). Same `#btn-settings` id, JS untouched.
- [x] Convention keybinds (2026-07-16): Ctrl+, opens/closes settings
  (VS Code/Obsidian/Zed), Ctrl+W closes with the unsaved-changes prompt, Ctrl+K wraps
  the selection as a markdown link `[sel](caret)` (Obsidian). Deliberately NOT bound:
  Ctrl+F (reserved for find & replace when it lands), Ctrl+P/Ctrl+Shift+P (no quick-open
  or command palette yet; native print left alone). Shortcuts grid, guide, DESIGN.md updated.
- [x] NSIS installer (2026-07-16): `bundle` config enabled — NSIS target,
  per-user install (no admin), WebView2 `downloadBootstrapper`, user's icon.
  `cargo tauri build` (tauri-cli 2.11.4 installed) produces
  `src-tauri\target\release\bundle\nsis\lwriter_0.1.0_x64-setup.exe` (1.9 MB;
  release exe 4.9 MB, console-free via windows_subsystem). Unsigned → SmartScreen
  warning until signed or reputation builds. Next distribution steps when wanted:
  GitHub release + winget manifest.
- [x] Save-before-close prompt (2026-07-16): `confirm_discard` replaced by
  `confirm_save` (native Yes/No/Cancel → save / don't save / cancel). One JS helper
  `confirmUnsaved()` guards close, Ctrl+W, new, open, sidebar note-switch, and
  drag-drop. Choosing Save on an unsaved doc runs Save As; cancelling that aborts
  the close. `restoreSession` now recovers the true dirty state (buffer vs disk;
  missing file or pathless content ⇒ dirty) so a restart can't bypass the prompt.
- App data note (2026-07-16): all prefs/session live in WebView2 storage at
  `%LOCALAPPDATA%\app.lwriter` (localStorage) — shared by debug and installed builds
  (same identifier). Notes live in `Documents\lwriter`. Nothing user-specific is in
  the installer. Delete the app.lwriter folder for a factory reset.
- [x] Find & replace (2026-07-16): Ctrl+F opens the floating find bar
  (top-right, write0-style; prefills from selection), Ctrl+H opens it with the
  replace row (chevron toggles it too). Enter/Shift+Enter and F3/Shift+F3 cycle;
  "Aa" toggles match case; Esc closes and drops the caret on the current match.
  Matches highlight via a third metrics-identical layer (`#find-layer`) under the
  textarea — yellow marks, orange for current — same alignment trick as the
  markdown backdrop. Replace/replace-all go through `replaceRange`
  (execCommand) so undo works; replace-all is one undo step + toast. Live
  recount on every edit; capped at 5000 matches. Editor-only (closed in preview).
- [x] Discard-privacy fix (2026-07-17): choosing "Don't Save" on close left
  the discarded text in the restorable session (saveSession runs on every keystroke),
  so it reappeared on next launch. `handleClose` now, on discard: clears the session
  for an Untitled doc, or rewrites it with the file's on-disk content for a saved doc
  (file reopens clean, edits gone). Added `clearSession()`. Note: Alt+F4/taskbar close
  bypasses JS entirely and still restores the buffer as crash-recovery — that's not a
  "discard" so it's intended.
- [x] Large-file performance (2026-07-17): per-line parse cache in markdown.js
  (`cachedHighlight`, Map keyed by line text, cleared past 20k entries). `highlightLine`
  ran ~6 regex passes per line on the FULL document every keystroke; now only the edited
  line re-parses, the rest are cache hits. Measured on a 10k-line doc:
  per-keystroke re-render 22.0 ms → 1.8 ms (~12×; stays under a 16.7 ms frame).
  Cold/open render ~34 ms. Sound because highlightLine is a pure function of line text.

- [x] Obsidian-style images (2026-07-21): paste an image → saved as
  "Pasted image YYYYMMDDHHMMSS.png" (Obsidian's naming) in the note's own folder
  and embedded as `![[name]]`; drop an image file → copied next to the note
  (no-op if already there) and embedded. Unsaved buffer → toast asking to save
  first (images need a home). New Rust commands `save_image` / `import_image` /
  `read_image`. Preview (Ctrl+E) + HTML export render both `![[wikilinks]]`
  (|size suffix tolerated) and `![alt](path)`: local sources become
  `data-msrc` placeholders that `hydrateImages()` resolves to data: URIs via
  read_image (no asset-protocol/CSP scope needed; export embeds them so it
  stays self-contained); remote https images load directly (CSP img-src now
  allows https/http). Editor backdrop highlights `![[...]]` as syntax+link.
  Missing files render a dashed "image not found" chip.
  Also fixed en route: renderPreview's bold/italic passes ran over the whole
  HTML string, so underscores inside generated attributes/code got rewritten
  (`data-msrc="my_cool_image.png"` → `my<em>cool</em>image.png`; same for
  hrefs and `<code>` content — pre-existing). Generated HTML is now stashed
  behind  N  tokens during the emphasis passes and restored before
  the block pass; link labels stay outside the stash so emphasis in them
  still renders. Verified in node.
- [x] Drag-drop rewired through Tauri's own event (2026-07-21): the
  HTML5 drop handler read `file.path`, which doesn't exist in WebView2 — and
  with dragDropEnabled Tauri swallows OS file drops anyway, so dropping a file
  onto the window was likely dead. Now `tauri://drag-drop` (payload.paths)
  feeds a shared `handleDroppedPaths()`: text file → open (unsaved-guard),
  image files → import + embed. HTML5 handler kept as fallback.
- [x] Sidebar folder tree (2026-07-21): a linked vault's notes were one
  flat modified-sorted list (subdir only hinted in the date line) — a note at
  2023/August/03.md just floated loose. Now `buildNoteTree()` groups the
  recursive listing by subdir and `renderNoteTree()` renders nested collapsible
  sections (chevron headers, 14px indent per level, folders first then notes,
  both numeric-aware alphabetical so "03" < "10"). Branches default collapsed;
  expanded ones persist in settings (`expandedDirs`, keyed folderPath::sub/dir).
  Right-click a subfolder → expand/collapse · show in explorer. Library and
  archived sections stay flat (library listing is root-only by design).

### Misc polish
- [x] Typewriter mode fix (2026-07-17): had bottom runway (50vh) but no top
  runway, so `scrollToCaretCenter` clamped to 0 near the top of a doc and the mode
  appeared to do nothing until the caret passed mid-screen. Added `:root.typewriter-mode
  { --editor-top: 50vh }` (all four editor layers share that var, so they stay aligned)
  — now every line, including the first, centers. `applyModes` toggles the root class.
- [x] Focus-mode flicker fix (2026-07-17): backdrop innerHTML is rebuilt each
  keystroke; `syncLayers()` forced a layout flush that committed new line divs at their
  default dimmed opacity before `.focus-active` was added, so the caret line animated
  0.25→1 (0.3s) every keystroke. Reordered `updateFocusParagraph()` before `syncLayers()`
  in `updateBackdrop()` — initial computed styles don't transition, so no flicker while
  typing; caret navigation (persistent nodes) still transitions smoothly.
- [x] Unsaved indicator (2026-07-17): replaced the ● dirty-dot next to the
  filename with a muted "— edited" suffix (macOS/native word-processor convention;
  lowercased for lwriter's voice). Same `state.dirty` toggle, renamed
  `updateDirtyDot`→`updateSaveIndicator`. Element `#unsaved-label`.

- [x] Advanced appearance settings (2026-07-17): collapsed "advanced"
  disclosure in the settings → appearance section (keeps defaults uncluttered). Adds:
  custom font file (new Rust `pick_font` returns name + base64 via `base64` crate;
  loaded with the FontFace API from an ArrayBuffer, which sidesteps CSP font-src;
  monospace auto-detected via canvas advance-width measure to decide whether
  weight/slant markdown styling is safe), custom line-spacing (unitless 1–3), and
  custom column width (24–120 rem). Custom values override the presets; picking a
  preset clears the matching custom value. All persist (`customFont` base64 in
  localStorage, `customLineHeight`, `customWidth`); custom font re-registers on
  startup and re-syncs metrics once loaded. NOTE: built + compiles + JS clean, but
  UNVERIFIED visually — app was behind the user's DAW at check time.

- [x] Spellcheck default confirmed (2026-07-17): the red-squiggle toggle already exists
  (Settings → writing → spellcheck, default on = matches iA Writer/macOS). Also set the
  textarea autocorrect/autocapitalize to off (inert on desktop WebView2, matches intent).
- [x] Export to HTML (2026-07-17): Ctrl+Shift+E (also in the sidebar's empty-space
  context menu) exports the current doc as a standalone, self-contained .html — embedded
  CSS, no external assets, light/dark via prefers-color-scheme, serif body + sans headings,
  42rem measure. Title derived from first H1 or filename. New Rust `save_html_dialog`
  (HTML filter); reuses `write_file` and `Markdown.renderPreview`. Verified the md→HTML
  conversion in node; the document wrapper is a static template.

### Notes on app.js size (2026-07-17)
~1900 lines now. This does NOT affect performance — browser JS is parsed/JIT'd once at
load; file length is irrelevant to runtime speed, and the Rust backend (lib.rs) is a
separate compilation unit entirely untouched by it. It's purely a maintainability
question. Current file is well-sectioned; a no-bundler split into multiple <script>s
(shared global scope, load-order-dependent) is possible but low-value right now. Revisit
if it keeps growing. Not doing a risky refactor before the macOS port.

- [x] Sidebar tree fixes (2026-07-21): `list_folder_notes` now returns
  `{ notes, dirs }` — dirs includes every subdirectory (even empty ones), so
  deleting the last note in a folder no longer hides the folder from the tree.
  Ctrl+N remembers the folder you're in: `state.newNoteDir` (parent of the open
  note, or the folder you right-clicked → new "new note here" items on folder/
  subdir context menus) is passed to `save_file_dialog` as `start_dir`, so the
  save dialog opens in that folder instead of always the library. Persists in
  the session so a restart doesn't lose the target. The unsaved "Untitled" row
  also renders *inside* that folder's tree branch (branch force-revealed,
  section held open) instead of floating rootless at the top of the sidebar;
  rootless pinning remains only for notes headed to the library/no folder.
- [x] System font picker fix (2026-07-21): picking fonts from
  C:\Windows\Fonts never worked — it's a virtual shell view; file dialogs show
  font "objects" that don't match extension filters. New `list_system_fonts`
  (registry enum, HKLM+HKCU, `winreg` crate, pretty names) feeds an
  "installed font" dropdown in settings → advanced; `read_font_file` loads the
  chosen file through the same FontFace path. File picker filter also gained
  ttc/otc + "All files".
- [x] Chrome hidden-by-default (2026-07-21): title/status bars now fade
  when you're simply *in* the editor (caret blinking), not only after typing —
  mousemove shows them and re-arms a 1.2s idle fade. Guards: pointer hovering a
  bar/sidebar, or the font menu open, blocks the fade; `mouseleave` re-arms.
  Armed at boot and on every loadDocument.

### Phase 5 — macOS port (2026-07-21)
- [x] Dialog threading fix: every rfd dialog command (open/save/folder/font/
  confirm) now goes through a new `run_dialog()` helper in lib.rs. On mac it
  hops to the main thread via `app.run_on_main_thread` + a channel (AppKit
  panels must run there — the old blanket `spawn_blocking` could hang/crash);
  other platforms keep the plain blocking-thread path. Required threading
  `tauri::AppHandle` into `open_file_dialog`, `save_file_dialog`,
  `open_folder_dialog`, `save_html_dialog`, `pick_font`, `confirm_save`.
- [x] `show_in_explorer` / `open_notes_dir` → new `open_in_file_manager()`
  (`open -R` / `open` on mac, `explorer /select,` on Windows, `xdg-open`
  elsewhere). Sidebar copy is platform-aware ("show in finder" vs
  "show in explorer").
- [x] `list_system_fonts` mac branch: no registry, so it walks
  `/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts` (2 levels
  deep) for ttf/otf/ttc, display name = file stem.
- [x] Guide note (`GUIDE_CONTENT`) is now rendered per-platform
  (`guide_content()`): mac gets a forward-slash notes path and Cmd-key
  wording instead of the Windows original.
- [x] `app.js` path joins that hardcoded `\\` (archive listing/move target,
  vault subdir paths, linked-folder prefix matching, image hydration)
  switched to `/` — Rust's std accepts forward slashes on Windows too, so
  this is one code path for both platforms instead of branching.
- [x] Platform-aware UI text: `IS_MAC` (UA sniff) toggles a `mac` class on
  `<html>`; `keyLabel()` rewrites "Ctrl+"/"Ctrl+Shift+" to ⌘/⇧⌘ across
  tooltips, the shortcuts grid, and context-menu hints. Notes-path string
  and "recycle bin"/"trash" wording also swap per platform. Find & Replace
  binds ⌥⌘F on mac (⌘H is the system Hide command there) alongside Ctrl+H.
- [x] Native window close: added an `onCloseRequested` listener so the
  traffic-light ✕ (and Cmd+W/Alt+F4) runs the same unsaved-changes flow as
  the custom ✕ button; `close_window` now calls `window.destroy()` instead
  of `close()` to avoid re-triggering that listener.
- [x] `tauri.macos.conf.json` added (Tauri merges platform config): native
  decorations, `titleBarStyle: Overlay` + `hiddenTitle` for traffic lights
  over the custom titlebar, `bundle.targets: [app, dmg]`, `icon.icns`.
  Confirmed via the built Info.plist (`app`/`dmg` bundles + `icon.icns`
  actually landed — the base config only lists `nsis` + `.ico`).
  `styles.css` hides `#titlebar-controls` and pads `#titlebar-left` ~78px
  on `html.mac` so the sidebar/Aa buttons clear the lights.
- [x] `--ui-font` gained `-apple-system, "SF Pro Text"` ahead of the Segoe
  UI stack.
- [x] Icon: extracted the 256×256 PNG frame from the repo's
  `icon_512x512@2x.ico` (python, manual ICO directory parse — the 512
  "@2x" name was aspirational, the largest real frame is 256) and ran
  `cargo tauri icon` to generate the full mac set incl. `icon.icns`.
- [x] Installed Rust (rustup, stable-aarch64-apple-darwin) + tauri-cli on
  this machine; `cargo build` (debug) and `cargo tauri build` (release,
  universal not attempted — arm64 host only) both succeed.
  `target/release/bundle/macos/lwriter.app` launches and stays up cleanly
  (checked process liveness + stderr; no screen-recording/accessibility
  permission in this environment to grab a pixel screenshot or drive the
  UI, so the visual pass — traffic lights, chrome padding, live theme
  follow, WKWebView font metrics/caret alignment, all the Phase-5 verify-list
  items — is still unconfirmed and needs an on-device look).
- [x] Ad-hoc signing fix (2026-07-21): v0.2.0's .dmg shipped with no
  bundle-level signature — arm64 Mach-Os get an automatic "linker-signed"
  ad-hoc signature on the executable, but that doesn't seal the bundle
  (`Sealed Resources=none`, `Info.plist=not bound` under `codesign -dv`),
  which isn't enough once Gatekeeper sees the quarantine flag a browser
  download sets: users got "lwriter is damaged and can't be opened,"
  a config away from the usual "unidentified developer" prompt.
  `tauri.macos.conf.json` now sets `bundle.macOS.signingIdentity: "-"`, so
  `cargo tauri build` deep-signs the whole bundle (ad-hoc, no Apple
  Developer account needed — confirmed via `codesign -dv`: Info.plist now
  bound, Sealed Resources present). Verified with a simulated quarantine
  xattr + `spctl -a --type execute` (this dev machine has Gatekeeper
  assessments globally disabled, so that's as far as it could be tested
  locally — real confirmation is the next external download). Re-shipped
  as v0.2.1; v0.2.0's release notes point here.
- [ ] Visual verification pass (see verify list below) — blocked on
  screen access in this session, not on code.
- [ ] Notarization (needs an Apple Developer account — warmpop's call).
  Ad-hoc signing fixes the "damaged" error but Gatekeeper still shows an
  "unidentified developer" prompt on first launch (right-click → Open).
- [ ] GitHub Actions macOS runner for CI builds (built locally for now).

**Verification note (2026-07-12):** dark/light live theme switching, Quattro rendering, and
chrome fade were verified on-screen. The sidebar + font menu build & parse clean but the
screen locked before they could be visually checked — needs a quick manual look.

## Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-07-12 | Tauri 2 over egui/iced/Slint | Typography quality (DirectWrite via WebView2) is the core product value; pure-Rust GUI text rendering isn't there yet; lets us mirror the write0 design directly. See DESIGN.md. |
| 2026-07-12 | Vanilla JS frontend, no npm/bundler | Zero build-step friction; `frontendDist` points straight at `ui/`. Keeps the FOSS project trivially buildable with only Rust installed. |
| 2026-07-12 | `rfd` crate for dialogs instead of tauri-plugin-dialog | Fewer moving parts / capabilities to configure; same underlying library. |
| 2026-07-12 | Editor = textarea + highlight backdrop layer | Real markdown styling while keeping native textarea robustness (IME, undo, selection). Same technique write0 uses. |
| 2026-07-12 | MIT license | Permissive FOSS default. |

## Known issues / gotchas

- Backdrop highlight layer may need throttling for files >10k lines (currently re-renders on every keystroke).
- Layered-editor invariant: nothing in `#backdrop`/`#editor`/`#caret-mirror` CSS or the
  markdown span styles may change glyph advance widths (no padding on inline spans, no
  font-size changes, `font-kerning: none`). Quattro keeps widths identical across
  regular/bold/italic, which is why bold headings don't drift.
