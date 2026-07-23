# lwriter

a calm, distraction-free writing app for Windows & Mac. free and open source.

your words live in plain markdown files on your own disk — no accounts,
no cloud, no toolbars, no telemetry. just typography and a blinking caret.

<p align="center">
  <a href="https://github.com/warmpop/lwriter/releases/download/v0.3.0/lwriter_0.3.0_x64-setup.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/windows-download-FFECB8?style=for-the-badge&logo=windows&logoColor=FFECB8&labelColor=2c2410"></a>
  &nbsp;
  <a href="https://github.com/warmpop/lwriter/releases/download/v0.3.0/lwriter_0.2.1_aarch64.dmg"><img alt="Download for macOS" src="https://img.shields.io/badge/macOS-download-FFECB8?style=for-the-badge&logo=apple&logoColor=FFECB8&labelColor=2c2410"></a>
  &nbsp;
  <a href="BUILD.md"><img alt="Build for Linux" src="https://img.shields.io/badge/linux-build%20from%20source-FFECB8?style=for-the-badge&logo=linux&logoColor=FFECB8&labelColor=2c2410"></a>
</p>

## what it does

- **markdown, styled live** — headings, bold, italic, code and quotes take
  shape as you type; syntax characters fade to a whisper
- **typewriter mode** (Ctrl+T) — the current line stays vertically centered
- **focus mode** (Ctrl+Shift+F) — everything but the current paragraph dims
- **notes sidebar** (Ctrl+D) — plain `.md` files in `Documents\lwriter`;
  rename, move, archive, delete from a context menu
- **obsidian-friendly** — link a vault and edit it in place as a real folder
  tree; nothing converted, nothing locked in
- **images** — paste or drop a picture and it's saved beside the note,
  embedded `![[like this]]`, rendered in preview
- **find & replace** (Ctrl+F / Ctrl+H) — live highlights, one-undo replace-all
- **preview & export** (Ctrl+E / Ctrl+Shift+E) — serif reading view and
  standalone self-contained HTML export
- **light & dark** — follows the Windows theme live, or pin either
- **your type** — JetBrains Mono & iA Writer Quattro bundled, any installed
  or custom font loadable
- **small** — native Rust (Tauri 2), ~2 MB installer, no Electron
- **discord rich presence** (optional, off by default) — an elapsed-time
  clock and a rotating status line; never your document's name or contents

## install

the buttons above download directly. the
[latest release](https://github.com/warmpop/lwriter/releases/latest) has
every build in one place.

**windows** (v0.3.0) — run the installer (Windows 10/11, 64-bit, per-user,
no admin). unsigned for now — SmartScreen may ask you to confirm.

**mac** (beta, v0.2.1) — open the `.dmg` and drag lwriter to Applications
(Apple Silicon, macOS 12+). unsigned, so the first launch needs
right-click → Open to get past Gatekeeper. the mac build isn't actively
updated right now, so it trails the Windows version.

**linux** — [build from source](BUILD.md); only Rust is required.

### uninstalling / resetting your data

lwriter never touches anything outside two places: your notes, and its own
settings. removing the app itself doesn't remove either — do that on purpose:

- **your notes** are plain `.md` files and are never deleted by an uninstall —
  they live in `Documents/lwriter`, plus wherever you've linked a vault.
  delete that folder yourself if you want them gone.
- **settings & session** (theme, fonts, window state — no writing) live
  separately from your notes:
  - windows: `%LOCALAPPDATA%\app.lwriter`
  - mac: `~/Library/WebKit/app.lwriter` (and `~/Library/Application Support/app.lwriter`
    if present) — delete both for a full reset
- **the app itself**:
  - windows: *Settings → Apps → installed apps → lwriter → uninstall*
    (or the portable `.exe`: just delete the file)
  - mac: drag `lwriter.app` out of Applications to the Trash

## build it yourself

only Rust required — no Node, no bundler. see [BUILD.md](BUILD.md)
(includes linux instructions).

## docs

- [DESIGN.md](DESIGN.md) — visual/UX spec and design tokens
- [ARCHITECTURE.md](ARCHITECTURE.md) — code layout, frontend ↔ backend bridge
- [PROGRESS.md](PROGRESS.md) — running log of what's built and what's next

## license

[MIT](LICENSE). bundled fonts (JetBrains Mono, iA Writer Quattro S) are under
the SIL Open Font License — see `ui/fonts/`.
