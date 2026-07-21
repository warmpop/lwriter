# lwriter — Design Spec

lwriter is a distraction-free plain-text / markdown writing app for Windows. The goal:
match the premium feel of iA Writer while being FOSS. Primary visual references:

1. **iA Writer** — calm, typography-first, almost no chrome, mono/duospace editing font.
2. **write0** (https://write.omarbadri.dev/) — we extracted its actual design tokens from
   its HTML/Tailwind config (see below).

## Framework decision

**Tauri 2 + vanilla HTML/CSS/JS frontend + Rust backend.**

Why not pure-Rust GUI (egui / iced / Slint)? Because in a writing app, *text rendering is
the entire product*. WebView2 renders through DirectWrite: proper kerning, ClearType
subpixel AA, ligatures, fast reflow. Pure-Rust GUI text stacks are still visibly worse and
their multiline text-editing widgets are immature. Tauri gives a native Windows `.exe`
(~10 MB), Rust owns all file I/O, and the UI layer is plain web tech — which also lets us
borrow directly from write0.

No Node/npm/bundler: `frontendDist` points at the static `ui/` folder. Only Rust required.

## Design tokens (extracted from write0, adapted)

### Color

Neutral gray ramp (Tailwind "neutral"):

| Token | Value | Usage (light) | Usage (dark) |
|-------|-------|----------------|---------------|
| gray-50 | `#fafafa` | app background | — |
| gray-100 | `#f5f5f5` | hover surfaces | text |
| gray-200 | `#e5e5e5` | borders | — |
| gray-300 | `#d4d4d4` | — | — |
| gray-400 | `#a3a3a3` | muted text / status bar | muted text / status bar |
| gray-500 | `#737373` | secondary text | secondary text |
| gray-700 | `#404040` | — | borders/hover |
| gray-800 | `#262626` | — | surfaces |
| gray-900 | `#171717` | text | app background |

- Accent (links, active controls, headings tint): `#3182ce` light / `#60a5fa` dark.
- Selection: soft blue (`#dbeafe` light / `#1e3a5f`-ish dark).
- Caret: accent color, 2px feel.

### Typography

- **Editor font:** `JetBrains Mono` (bundled, default) with a titlebar "Aa" picker offering
  `iA Writer Quattro S` (bundled), `Georgia`, and `Times New Roman` → fallback
  `Cascadia Code`, `Consolas`, monospace. Both bundled families are SIL OFL (licenses in
  `ui/fonts/`). Size **18px** (1.125rem), line-height **1.75**. This is the write0 spec exactly.
  Proportional fonts disable weight/slant markdown styling (metrics drift) — color-only.
- **UI chrome font:** `Segoe UI Variable`, `Segoe UI`, system-ui.  Small sizes (12–13px),
  medium weight, generous letter-spacing on labels.
- **Preview (rendered markdown) font:** `Georgia`, serif — max width `65ch`, like write0's
  Merriweather prose.
- Editor column: centered, max-width **48rem** (matches write0's
  `padding-left: calc(50% - 24rem)` trick). Content top padding ≈ 3rem.

### Layout

```
┌──────────────────────────────────────────────┐
│ titlebar (36px): [filename — edited]  ─ □ ✕  │  ← frameless window, custom bar, drag region
│                                              │
│              (centered 48rem column)         │
│              # Heading                       │
│              Body text at 18px/1.75 ...      │
│                                              │
│ statusbar (28px): 128 words · 723 chars · 1m │  ← muted, fades away while typing
└──────────────────────────────────────────────┘
```

- Frameless window (`decorations: false`), custom title bar with Windows-order controls
  (min / max / close on the right). Close button hover = `#e81123` red, standard Windows.
- **Auto-hiding chrome:** while the user types, title bar + status bar fade to near-zero
  opacity; any mouse movement brings them back. iA-style calm.
- Scrollbars hidden (content still scrolls) — write0's `.no-scrollbar` approach, but keep
  a minimal overlay thumb on hover if feasible.

### Editor behavior

- Layered editor: a `<div>` backdrop renders markdown-styled HTML behind a transparent-text
  `<textarea>` (caret stays visible). Both share identical font metrics; backdrop scroll is
  synced. Styling must NEVER change glyph advance width (mono font, bold/italic only,
  no font-size changes) or the layers drift.
- Markdown live styling: `#` headings bold+accent, `**bold**`, `*italic*`, `` `code` ``
  subtle background, `>` quotes muted italic, list markers accent, links underlined,
  syntax characters (`#`, `*`, `` ` ``) rendered at ~45% opacity like iA Writer.
- **Typewriter mode:** caret line held vertically centered; bottom padding `50vh` runway.
- **Focus mode:** all paragraphs except the current one dimmed to ~30% opacity with a
  smooth transition.
- **Preview mode:** replaces editor with rendered markdown (serif, 65ch). Not split-pane
  in v1 (window is often narrow); toggle with Ctrl+E.

### Motion

- One animation vocabulary: `fadeInUp` 0.3s ease-out (from write0) for panels/toasts;
  opacity transitions 150–200ms for chrome hide/show and theme changes.
- No springy/bouncy motion. Calm.

### Keyboard map

| Keys | Action |
|------|--------|
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | new / open / save / save as |
| Ctrl+D | toggle notes sidebar |
| Ctrl+E | toggle markdown preview |
| Ctrl+Shift+E | export current document to a standalone .html file |
| Ctrl+T | typewriter mode |
| Ctrl+Shift+F | focus mode |
| Ctrl+B / Ctrl+I | bold / italic wrap selection |
| Ctrl+K | wrap selection as markdown link (Obsidian convention) |
| Ctrl+F / Ctrl+H | find / find & replace (Enter/Shift+Enter or F3 cycle matches) |
| Ctrl+, | settings (VS Code/Obsidian/Zed convention) |
| Ctrl+W | close window (confirms if unsaved) |
| Ctrl+Shift+L | cycle theme (system → light → dark) |
| Ctrl+= / Ctrl+- / Ctrl+0 | font size up / down / reset |

### Voice & details

- App name lowercase everywhere: **lwriter**.
- Empty state: single muted line, e.g. "start writing" — no onboarding, no tour.
- Word count = the only always-relevant metric; chars + reading time secondary.
- Unsaved state = a muted "— edited" after the filename (native word-processor
  convention), never a modal until close is attempted.
