# lwriter — Setup

## Prerequisites

- **Rust** (stable, 1.75+) — [rustup.rs](https://rustup.rs)
- **Windows 10+** with WebView2 runtime (bundled with Windows 10 21H2+)

No Node.js, npm, or any other toolchain is required.

## Build & run

```sh
cd lwriter
cargo install tauri-cli --version "^2"
cargo tauri dev
```

For a release build:

```sh
cargo tauri build
```

Output lands in `src-tauri/target/release/bundle/`.

## Project structure

- `ui/` — static HTML/CSS/JS frontend, served directly (no build step).
- `src-tauri/` — Rust backend: Tauri shell, file I/O commands, native dialogs.

## Troubleshooting

- **"WebView2 not found"**: Install the Evergreen WebView2 runtime from Microsoft.
- **`rfd` dialogs don't appear**: Make sure you're on the main thread / using `spawn_blocking`.
- **CSP blocking fonts/styles**: Check `tauri.conf.json` → `app.security.csp`.
