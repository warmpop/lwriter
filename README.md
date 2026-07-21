# lwriter

a calm, distraction-free writing app for Windows. free and open source.

your words live in plain markdown files on your own disk — no accounts,
no cloud, no toolbars, no telemetry. just typography and a blinking caret.

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

## install

grab the installer from [releases](https://github.com/warmpop/lwriter/releases/latest)
(Windows 10/11, 64-bit, per-user, no admin). unsigned for now — SmartScreen
may ask you to confirm.

## build it yourself

only Rust required — no Node, no bundler. see [BUILD.md](BUILD.md)
(includes linux instructions; macOS port is planned).

## docs

- [DESIGN.md](DESIGN.md) — visual/UX spec and design tokens
- [ARCHITECTURE.md](ARCHITECTURE.md) — code layout, frontend ↔ backend bridge
- [PROGRESS.md](PROGRESS.md) — running log of what's built and what's next

## license

[MIT](LICENSE). bundled fonts (JetBrains Mono, iA Writer Quattro S) are under
the SIL Open Font License — see `ui/fonts/`.
