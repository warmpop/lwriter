/* ============================================
   lwriter — Main Application Controller
   ============================================

   Ties together the editor, backdrop, theme,
   chrome, keyboard shortcuts, and Tauri bridge.
*/

'use strict';

/* ---------- Tauri bridge ---------- */
const Tauri = window.__TAURI_INTERNALS__;
const invoke = Tauri ? (cmd, args) => Tauri.invoke(cmd, args) : () => Promise.resolve(null);

/* ---------- Platform ----------
   The mac class swaps the custom caption buttons for native traffic lights
   (see styles.css); keyLabel turns "Ctrl+Shift+S" into "⇧⌘S" for every
   user-facing shortcut string. */
const IS_MAC = navigator.userAgent.includes('Mac');
if (IS_MAC) document.documentElement.classList.add('mac');

const NOTES_DIR_LABEL = IS_MAC ? 'Documents/lwriter' : 'Documents\\lwriter';
const REVEAL_LABEL = IS_MAC ? 'show in finder' : 'show in explorer';

function keyLabel(s) {
  if (!IS_MAC) return s;
  return s.replace(/Ctrl\+Shift\+/g, '⇧⌘').replace(/Ctrl\+/g, '⌘');
}

/* ---------- DOM refs ---------- */
const $ = (sel) => document.querySelector(sel);

const dom = {
  titlebar:        $('#titlebar'),
  statusbar:       $('#statusbar'),
  filenameText:    $('#filename-text'),
  unsavedLabel:    $('#unsaved-label'),
  editor:          $('#editor'),
  backdrop:        $('#backdrop'),
  editorWrapper:   $('#editor-wrapper'),
  editorArea:      $('#editor-area'),
  preview:         $('#preview'),
  wordCount:       $('#word-count'),
  charCount:       $('#char-count'),
  readingTime:     $('#reading-time'),
  modeLabel:       $('#mode-label'),
  themeLabel:      $('#theme-label'),
  btnMin:          $('#btn-minimize'),
  btnMax:          $('#btn-maximize'),
  btnClose:        $('#btn-close'),
  btnSidebar:      $('#btn-sidebar'),
  btnFont:         $('#btn-font'),
  fontMenu:        $('#font-menu'),
  sidebar:         $('#sidebar'),
  notesList:       $('#notes-list'),
};

/* ---------- Editor fonts ----------
   Monospace/duospace fonts keep glyph widths identical across weights, so
   the backdrop can render real bold/italic. Proportional fonts can't —
   they get the color-only markdown styling (see styles.css). */
const FONTS = [
  { id: 'jetbrains', label: 'JetBrains Mono',
    stack: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace', proportional: false },
  { id: 'quattro', label: 'iA Writer Quattro',
    stack: '"iA Writer Quattro S", "JetBrains Mono", monospace', proportional: false },
  { id: 'georgia', label: 'Georgia',
    stack: 'Georgia, "Times New Roman", serif', proportional: true },
  { id: 'times', label: 'Times New Roman',
    stack: '"Times New Roman", Times, serif', proportional: true },
];

/* ---------- App State ---------- */
const state = {
  filePath: null,
  fileName: 'Untitled',
  dirty: false,
  theme: 'system',        // 'system' | 'light' | 'dark'
  systemTheme: null,      // OS theme as reported by Tauri ('light' | 'dark' | null)
  fontSize: 18,
  editorFont: 'jetbrains',
  editorWidth: 'normal',   // 'narrow' | 'normal' | 'wide'
  lineSpacing: 'normal',   // 'compact' | 'normal' | 'relaxed'
  customFont: null,        // { name, data(base64), mono } — advanced override
  customLineHeight: null,  // number, overrides lineSpacing preset when set
  customWidth: null,       // rem number, overrides editorWidth preset when set
  spellcheck: true,
  chromeAutoHide: true,
  discordPresence: false, // opt-in — the one setting that talks to a third party
  typewriterMode: false,
  focusMode: false,
  previewMode: false,
  sidebarVisible: false,
  chromeVisible: true,
  linkedFolders: [],       // [{ path, name, collapsed }] — e.g. Obsidian vaults
  expandedDirs: {},        // { "folderPath::sub/dir": true } — open tree branches
  newNoteDir: null,        // where an unsaved Ctrl+N note should save by default
  notesRoot: null,         // absolute path of Documents\lwriter (fetched once)
  archiveCollapsed: true,  // "archived" sidebar section folded by default
};

const EDITOR_WIDTHS = { narrow: '40rem', normal: '48rem', wide: '58rem' };
const LINE_SPACINGS = { compact: '1.6', normal: '1.75', relaxed: '1.95' };

/* ---------- Platform text ----------
   The static HTML is written with Windows wording; on a mac the shortcut
   hints become ⌘-style and the notes path uses forward slashes. Replace on
   mac is ⌥⌘F — ⌘H belongs to the system Hide command. */
function applyPlatformText() {
  $('#notes-path-label').textContent = `notes are stored in ${NOTES_DIR_LABEL}`;
  if (!IS_MAC) return;
  $('#kbd-replace').textContent = '⌥⌘F';
  $('#find-toggle-replace').title = 'Toggle replace (⌥⌘F)';
  document.querySelectorAll('kbd').forEach((k) => {
    k.textContent = keyLabel(k.textContent);
  });
  document.querySelectorAll('[title*="Ctrl"]').forEach((el) => {
    el.title = keyLabel(el.title);
  });
}

/* ---------- Init ---------- */
function init() {
  applyPlatformText();
  loadSettings();
  applyTheme();
  applyFontSize();
  applyEditorFont();
  applyEditorLayout();
  if (state.customFont) {
    // FontFace load is async; re-apply once the glyphs are available so the
    // caret metrics and backdrop realign.
    registerCustomFont().then(() => { applyEditorFont(); syncLayers(); syncSettingsUI(); });
  }
  applySpellcheck();
  applyModes();
  applySidebar();
  invoke('discord_set_enabled', { enabled: state.discordPresence }).catch(() => {});
  setupDiscordStatus();
  setupEditorEvents();
  setupWindowControls();
  setupSidebar();
  setupFontPicker();
  setupSettings();
  setupContextMenus();
  setupFind();
  setupThemeDetection();
  setupChromeAutoHide();
  updateStats();
  updateThemeLabel();
  updateModeLabel();
  updateTitlebar();

  restoreSession();
  invoke('discord_session_start').catch(() => {}); // fresh elapsed-time clock for this launch

  // Clicking the empty margins focuses the editor
  dom.editorArea.addEventListener('click', (e) => {
    if (e.target === dom.editorArea || e.target === dom.editorWrapper) {
      dom.editor.focus();
    }
  });
}

/* ---------- Settings persistence ---------- */
const SETTINGS_KEY = 'lwriter_settings';
const SESSION_KEY = 'lwriter_session';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.theme) state.theme = s.theme;
      if (s.fontSize) state.fontSize = s.fontSize;
      if (s.editorFont && FONTS.some(f => f.id === s.editorFont)) state.editorFont = s.editorFont;
      if (s.editorWidth in EDITOR_WIDTHS) state.editorWidth = s.editorWidth;
      if (s.lineSpacing in LINE_SPACINGS) state.lineSpacing = s.lineSpacing;
      if (s.customFont && typeof s.customFont.data === 'string') {
        state.customFont = { name: s.customFont.name || 'Custom', data: s.customFont.data, mono: !!s.customFont.mono };
      }
      if (typeof s.customLineHeight === 'number') state.customLineHeight = s.customLineHeight;
      if (typeof s.customWidth === 'number') state.customWidth = s.customWidth;
      if (s.editorFont === 'custom' && state.customFont) state.editorFont = 'custom';
      if (s.spellcheck !== undefined) state.spellcheck = s.spellcheck;
      if (s.chromeAutoHide !== undefined) state.chromeAutoHide = s.chromeAutoHide;
      if (s.discordPresence !== undefined) state.discordPresence = !!s.discordPresence;
      if (s.typewriterMode !== undefined) state.typewriterMode = s.typewriterMode;
      if (s.focusMode !== undefined) state.focusMode = s.focusMode;
      if (s.sidebarVisible !== undefined) state.sidebarVisible = s.sidebarVisible;
      if (Array.isArray(s.linkedFolders)) {
        state.linkedFolders = s.linkedFolders
          .filter(f => f && typeof f.path === 'string')
          .map(f => ({ path: f.path, name: f.name || folderNameFromPath(f.path), collapsed: !!f.collapsed }));
      }
      if (s.archiveCollapsed !== undefined) state.archiveCollapsed = s.archiveCollapsed;
      if (s.expandedDirs && typeof s.expandedDirs === 'object') state.expandedDirs = s.expandedDirs;
    }
  } catch (_) { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    theme: state.theme,
    fontSize: state.fontSize,
    editorFont: state.editorFont,
    editorWidth: state.editorWidth,
    lineSpacing: state.lineSpacing,
    customFont: state.customFont,
    customLineHeight: state.customLineHeight,
    customWidth: state.customWidth,
    spellcheck: state.spellcheck,
    chromeAutoHide: state.chromeAutoHide,
    discordPresence: state.discordPresence,
    typewriterMode: state.typewriterMode,
    focusMode: state.focusMode,
    sidebarVisible: state.sidebarVisible,
    linkedFolders: state.linkedFolders,
    expandedDirs: state.expandedDirs,
    archiveCollapsed: state.archiveCollapsed,
  }));
}

async function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.newNoteDir === 'string') state.newNoteDir = s.newNoteDir;
    if (s.content) {
      dom.editor.value = s.content;
      updateBackdrop();
      updateStats();
    }
    if (s.filePath) {
      state.filePath = s.filePath;
      state.fileName = fileNameFromPath(s.filePath);
      updateTitlebar();
      // The restored buffer may differ from what's on disk — recover the
      // real dirty state so the close prompt can't be bypassed by a restart.
      try {
        const onDisk = await invoke('read_file', { path: s.filePath });
        state.dirty = onDisk !== dom.editor.value;
      } catch (_) {
        state.dirty = true; // file missing — this buffer is the only copy
      }
      updateSaveIndicator();
    } else if (s.content) {
      // Unsaved document with content: it only exists here
      state.dirty = true;
      updateSaveIndicator();
    }
  } catch (_) { /* ignore */ }
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    content: dom.editor.value,
    filePath: state.filePath,
    newNoteDir: state.newNoteDir,
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* ---------- Theme ----------
   Follows the Windows app theme by default ('system'). Two signals:
   1. prefers-color-scheme — WebView2 tracks the OS setting.
   2. Tauri's window theme + theme-changed event — covers WebView2
      builds where the media query doesn't update live.               */
function systemPrefersDark() {
  if (state.systemTheme) return state.systemTheme === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme() {
  const isDark = state.theme === 'dark' ||
    (state.theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

function cycleTheme() {
  const modes = ['system', 'light', 'dark'];
  const idx = modes.indexOf(state.theme);
  state.theme = modes[(idx + 1) % modes.length];
  applyTheme();
  updateThemeLabel();
  saveSettings();
  syncSettingsUI();
}

function updateThemeLabel() {
  const labels = { system: 'auto', light: 'light', dark: 'dark' };
  dom.themeLabel.textContent = labels[state.theme] || '';
}

function setupThemeDetection() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme();
  });

  try {
    const win = window.__TAURI__?.window?.getCurrentWindow?.();
    if (win) {
      win.theme().then((t) => {
        if (t) {
          state.systemTheme = t;
          if (state.theme === 'system') applyTheme();
        }
      }).catch(() => {});
      win.onThemeChanged(({ payload }) => {
        state.systemTheme = payload;
        if (state.theme === 'system') applyTheme();
      }).catch(() => {});
    }
  } catch (_) { /* Tauri global API unavailable — matchMedia still applies */ }
}

/* ---------- Editor font ---------- */
const CUSTOM_FONT_FAMILY = 'lwriter-custom-font';

function applyEditorFont() {
  const root = document.documentElement;
  if (state.editorFont === 'custom' && state.customFont) {
    root.style.setProperty('--editor-font', `"${CUSTOM_FONT_FAMILY}", "JetBrains Mono", monospace`);
    // Proportional fonts drift the backdrop; only enable weight/slant markdown
    // styling when the custom font measured as monospace.
    root.classList.toggle('proportional-font', !state.customFont.mono);
  } else {
    const font = FONTS.find(f => f.id === state.editorFont) || FONTS[0];
    root.style.setProperty('--editor-font', font.stack);
    root.classList.toggle('proportional-font', font.proportional);
  }
}

function setEditorFont(id) {
  state.editorFont = id;
  applyEditorFont();
  syncLayers();
  saveSettings();
  renderFontMenu();
  syncSettingsUI();
}

/* ---------- Custom font (advanced settings) ---------- */
function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Measure whether a loaded font family renders with fixed advance widths. */
function detectMonospace(family) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `32px "${family}"`;
  return Math.abs(ctx.measureText('i').width - ctx.measureText('W').width) < 0.5;
}

async function registerCustomFont() {
  if (!state.customFont) return false;
  try {
    const face = new FontFace(CUSTOM_FONT_FAMILY, base64ToArrayBuffer(state.customFont.data));
    await face.load();
    document.fonts.add(face);
    state.customFont.mono = detectMonospace(CUSTOM_FONT_FAMILY);
    return true;
  } catch (e) {
    console.error('Custom font failed to load:', e);
    return false;
  }
}

async function applyCustomFontData(name, data) {
  state.customFont = { name, data, mono: false };
  if (!(await registerCustomFont())) {
    state.customFont = null;
    toast('could not load that font');
    syncSettingsUI();
    return;
  }
  state.editorFont = 'custom';
  applyEditorFont();
  syncLayers();
  saveSettings();
  syncSettingsUI();
  toast(`font applied: ${name}`);
}

async function pickCustomFont() {
  const result = await invoke('pick_font');
  if (!result) return;
  await applyCustomFontData(result.name, result.data);
}

/* Installed system fonts (registry-enumerated) — the Windows Fonts folder
   is a virtual shell view that file dialogs can't pick from, so the
   settings dialog offers a real dropdown instead. Populated lazily. */
let systemFontsLoaded = false;

async function populateSystemFonts() {
  if (systemFontsLoaded) return;
  systemFontsLoaded = true;
  const fonts = (await invoke('list_system_fonts').catch(() => null)) || [];
  const sel = $('#system-font');
  for (const f of fonts) {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.dataset.name = f.name;
    opt.textContent = f.name;
    sel.appendChild(opt);
  }
}

function clearCustomFont() {
  state.customFont = null;
  if (state.editorFont === 'custom') state.editorFont = 'jetbrains';
  applyEditorFont();
  syncLayers();
  saveSettings();
  syncSettingsUI();
  renderFontMenu();
}

function setupFontPicker() {
  renderFontMenu();
  dom.btnFont.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.fontMenu.classList.toggle('hidden');
    dom.btnFont.classList.toggle('active', !dom.fontMenu.classList.contains('hidden'));
  });
  document.addEventListener('click', (e) => {
    if (!dom.fontMenu.classList.contains('hidden') && !e.target.closest('#font-picker')) {
      closeFontMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFontMenu();
  });
}

function closeFontMenu() {
  dom.fontMenu.classList.add('hidden');
  dom.btnFont.classList.remove('active');
}

function renderFontMenu() {
  dom.fontMenu.textContent = '';
  for (const font of FONTS) {
    const btn = document.createElement('button');
    btn.tabIndex = -1;
    btn.setAttribute('role', 'menuitem');
    btn.classList.toggle('selected', font.id === state.editorFont);
    const label = document.createElement('span');
    label.textContent = font.label;
    label.style.fontFamily = font.stack;
    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = '✓';
    btn.append(label, check);
    btn.addEventListener('click', () => {
      setEditorFont(font.id);
      closeFontMenu();
      dom.editor.focus();
    });
    dom.fontMenu.appendChild(btn);
  }
}

/* ---------- Sidebar (notes library) ---------- */
function applySidebar() {
  dom.sidebar.classList.toggle('collapsed', !state.sidebarVisible);
  dom.btnSidebar.classList.toggle('active', state.sidebarVisible);
}

function setupSidebar() {
  dom.btnSidebar.addEventListener('click', toggleSidebar);
  $('#btn-link-folder').addEventListener('click', linkFolder);
  if (state.sidebarVisible) refreshNotes();
}

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  applySidebar();
  if (state.sidebarVisible) refreshNotes();
  saveSettings();
}

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function folderNameFromPath(path) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
}

function makeNoteItem(note, opts) {
  const item = document.createElement('div');
  item.className = 'note-item';
  item.setAttribute('role', 'button');
  item.classList.toggle('current', note.path === state.filePath);
  item._note = note;
  const name = document.createElement('span');
  name.className = 'note-name';
  name.textContent = note.name.replace(/\.(md|markdown|txt|text)$/i, '');
  const date = document.createElement('span');
  date.className = 'note-date';
  // Inside the folder tree the location is conveyed by structure, not text
  const place = (opts && opts.hidePlace) ? '' : (note._sourceName
    ? note._sourceName + (note.subdir ? '/' + note.subdir : '')
    : note.subdir);
  date.textContent = (place ? place + ' · ' : '') + relativeTime(note.modified);
  item.append(name, date);
  item.title = note.path;
  item.addEventListener('click', () => openNotePath(note.path));
  return item;
}

/** Row for the not-yet-saved current document. */
function makeUnsavedItem() {
  const item = document.createElement('div');
  item.className = 'note-item current';
  const name = document.createElement('span');
  name.className = 'note-name';
  name.textContent = state.fileName;
  const date = document.createElement('span');
  date.className = 'note-date';
  date.textContent = `unsaved — ${keyLabel('Ctrl+S')} to keep it`;
  item.append(name, date);
  return item;
}

async function refreshNotes() {
  let notes = [];
  try {
    notes = await invoke('list_notes') || [];
  } catch (e) {
    console.error('Failed to list notes:', e);
  }
  if (!state.notesRoot) {
    state.notesRoot = await invoke('get_notes_dir').catch(() => null);
  }
  // null result = folder unreadable (moved/renamed) — shown as such, kept linked
  const folderResults = await Promise.all(state.linkedFolders.map(f =>
    invoke('list_folder_notes', { path: f.path }).catch(() => null)
  ));

  // Archives live at <root>\archive of the library and each linked folder;
  // a missing archive folder just means nothing archived there yet.
  const archiveRoots = [];
  if (state.notesRoot) archiveRoots.push({ name: 'notes', path: state.notesRoot });
  for (const f of state.linkedFolders) archiveRoots.push({ name: f.name, path: f.path });
  const archiveResults = await Promise.all(archiveRoots.map(r =>
    invoke('list_folder_notes', { path: r.path + '/archive' }).catch(() => null)
  ));
  const archived = [];
  archiveRoots.forEach((r, i) => {
    for (const n of (archiveResults[i] && archiveResults[i].notes) || []) {
      n._archiveRoot = r.path;
      n._sourceName = r.name;
      archived.push(n);
    }
  });
  archived.sort((a, b) => b.modified - a.modified);

  dom.notesList.textContent = '';

  // The current document only exists on disk once saved. If Ctrl+N happened
  // inside a linked folder, the unsaved row belongs in that folder's tree;
  // otherwise it's pinned to the top of the list.
  let unsavedHome = null; // { folder, subdir } within a linked folder
  if (!state.filePath && state.newNoteDir) {
    // Normalize separators so the comparison works on both platforms
    const dir = state.newNoteDir.replace(/\\/g, '/');
    for (const f of state.linkedFolders) {
      const base = f.path.replace(/\\/g, '/');
      if (dir === base || dir.startsWith(base + '/')) {
        unsavedHome = { folder: f, subdir: dir === base ? '' : dir.slice(base.length + 1) };
        break;
      }
    }
  }

  if (!state.filePath && !unsavedHome) {
    dom.notesList.appendChild(makeUnsavedItem());
  }

  if (notes.length === 0 && state.filePath && state.linkedFolders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.textContent = `no notes yet — saved files land in ${NOTES_DIR_LABEL}`;
    dom.notesList.appendChild(empty);
  }

  for (const note of notes) {
    dom.notesList.appendChild(makeNoteItem(note));
  }

  state.linkedFolders.forEach((folder, i) => {
    const unsavedSubdir = unsavedHome && unsavedHome.folder === folder
      ? unsavedHome.subdir : null;
    dom.notesList.appendChild(makeFolderSection(folder, folderResults[i], unsavedSubdir));
  });

  if (archived.length > 0) {
    dom.notesList.appendChild(makeArchiveSection(archived));
  }
}

function makeArchiveSection(archived) {
  const section = document.createElement('div');
  section.className = 'folder-section archive-section';
  section.classList.toggle('collapsed-section', state.archiveCollapsed);

  const header = document.createElement('button');
  header.tabIndex = -1;
  header.className = 'folder-header';
  header.title = 'Archived notes — right-click one to unarchive';
  header.innerHTML =
    '<svg class="chevron" width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
    '<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const label = document.createElement('span');
  label.className = 'folder-name';
  label.textContent = 'archived';
  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = `(${archived.length})`;
  header.append(label, count);
  header.addEventListener('click', () => {
    state.archiveCollapsed = !state.archiveCollapsed;
    section.classList.toggle('collapsed-section', state.archiveCollapsed);
    saveSettings();
  });

  const items = document.createElement('div');
  items.className = 'folder-items';
  for (const note of archived) {
    items.appendChild(makeNoteItem(note));
  }

  section.append(header, items);
  return section;
}

/* ---------- Linked folders (Obsidian vaults etc.) ---------- */
function makeFolderSection(folder, listing, unsavedSubdir) {
  const hasUnsaved = unsavedSubdir !== null && unsavedSubdir !== undefined;
  const section = document.createElement('div');
  section.className = 'folder-section';
  // A section holding the unsaved current note stays open so it's visible
  section.classList.toggle('collapsed-section', folder.collapsed && !hasUnsaved);

  const header = document.createElement('button');
  header.tabIndex = -1;
  header.className = 'folder-header';
  header.title = folder.path;
  header._folder = folder;
  header.innerHTML =
    '<svg class="chevron" width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
    '<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const label = document.createElement('span');
  label.className = 'folder-name';
  label.textContent = folder.name;
  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = listing ? `(${listing.notes.length})` : '';
  const unlink = document.createElement('button');
  unlink.tabIndex = -1;
  unlink.className = 'folder-unlink';
  unlink.title = 'Unlink this folder (nothing is deleted)';
  unlink.setAttribute('aria-label', `Unlink ${folder.name}`);
  unlink.innerHTML =
    '<svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">' +
    '<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" stroke-width="1.2"/></svg>';
  unlink.addEventListener('click', (e) => {
    e.stopPropagation();
    state.linkedFolders = state.linkedFolders.filter(f => f !== folder);
    saveSettings();
    refreshNotes();
  });
  header.append(label, count, unlink);
  header.addEventListener('click', () => {
    folder.collapsed = !folder.collapsed;
    section.classList.toggle('collapsed-section', folder.collapsed);
    saveSettings();
  });

  const items = document.createElement('div');
  items.className = 'folder-items';
  if (listing === null) {
    const missing = document.createElement('div');
    missing.className = 'notes-empty';
    missing.textContent = 'folder not found — was it moved?';
    items.appendChild(missing);
  } else if (listing.notes.length === 0 && listing.dirs.length === 0 && !hasUnsaved) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.textContent = 'no notes in this folder';
    items.appendChild(empty);
  } else {
    // The unsaved current note renders inside the branch it will save into
    const entries = hasUnsaved
      ? { notes: [...listing.notes, { name: state.fileName, subdir: unsavedSubdir, modified: Date.now(), _unsaved: true }], dirs: listing.dirs }
      : listing;
    renderNoteTree(items, buildNoteTree(entries), folder, '', 0, hasUnsaved ? unsavedSubdir : null);
  }

  section.append(header, items);
  return section;
}

/* ---------- Folder tree ----------
   A linked folder's recursive listing is grouped by its subdir paths into
   nested, collapsible sections (Obsidian-style), instead of one flat list.
   Open/closed state persists per branch in state.expandedDirs. */

/** Group a recursive listing into nested { dirs, notes } by subdir path.
    Directories come from the listing's own dirs array, so empty folders
    still appear in the tree. */
function buildNoteTree(listing) {
  const root = { dirs: new Map(), notes: [] };
  const nodeFor = (relPath) => {
    let node = root;
    if (relPath) {
      for (const part of relPath.split('/')) {
        if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), notes: [] });
        node = node.dirs.get(part);
      }
    }
    return node;
  };
  for (const dir of listing.dirs || []) nodeFor(dir);
  for (const note of listing.notes) nodeFor(note.subdir).notes.push(note);
  return root;
}

// Numeric-aware compare so "03.md" and "10.md" sort like files, not strings
const treeCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

function renderNoteTree(container, node, folder, subpath, depth, revealPath) {
  const indent = (10 + depth * 14) + 'px';

  for (const name of [...node.dirs.keys()].sort(treeCompare)) {
    const childPath = subpath ? subpath + '/' + name : name;
    const key = folder.path + '::' + childPath;
    // Branches on the way to the unsaved current note are held open
    const onRevealPath = revealPath != null &&
      (revealPath === childPath || revealPath.startsWith(childPath + '/'));

    const section = document.createElement('div');
    section.className = 'subdir-section';
    section.classList.toggle('collapsed-section', !state.expandedDirs[key] && !onRevealPath);

    const header = document.createElement('button');
    header.tabIndex = -1;
    header.className = 'subdir-header';
    header.style.paddingLeft = indent;
    // Rust's std accepts '/' joins on Windows too — no separator branching
    header._subdir = { key, path: folder.path + '/' + childPath };
    header.innerHTML =
      '<svg class="chevron" width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
      '<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const label = document.createElement('span');
    label.className = 'subdir-name';
    label.textContent = name;
    header.appendChild(label);
    header.addEventListener('click', () => {
      if (state.expandedDirs[key]) delete state.expandedDirs[key];
      else state.expandedDirs[key] = true;
      section.classList.toggle('collapsed-section', !state.expandedDirs[key]);
      saveSettings();
    });

    const children = document.createElement('div');
    children.className = 'subdir-items';
    renderNoteTree(children, node.dirs.get(name), folder, childPath, depth + 1, revealPath);

    section.append(header, children);
    container.appendChild(section);
  }

  for (const note of [...node.notes].sort((a, b) => treeCompare(a.name, b.name))) {
    const item = note._unsaved ? makeUnsavedItem() : makeNoteItem(note, { hidePlace: true });
    item.style.paddingLeft = indent;
    container.appendChild(item);
  }
}

async function linkFolder() {
  const path = await invoke('open_folder_dialog');
  if (!path) return;
  if (state.linkedFolders.some(f => f.path === path)) return;
  state.linkedFolders.push({ path, name: folderNameFromPath(path), collapsed: false });
  saveSettings();
  refreshNotes();
}

/* ---------- Toast (transient feedback) ---------- */
let toastTimer = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- Discord presence status ----------
   The Rust side emits a `discord-status` event on connect/wait so the
   toggle gives real feedback instead of failing silently. */
function setupDiscordStatus() {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return;
  const messages = {
    connected: 'discord: connected',
    waiting: 'discord: waiting for discord to open…',
  };
  listen('discord-status', (e) => {
    const msg = messages[e.payload];
    // Only speak up while the feature is on (avoids a stray toast if a
    // late "waiting" arrives right after the user turned it off)
    if (msg && state.discordPresence) toast(msg);
  }).catch(() => {});
}

/* ---------- Sidebar context menu ---------- */
let ctxMenuEl = null;

function closeContextMenu() {
  if (ctxMenuEl) {
    ctxMenuEl.remove();
    ctxMenuEl = null;
  }
}

function showContextMenu(x, y, items) {
  closeContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'menu context-menu';
  for (const it of items) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      ctxMenuEl.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.tabIndex = -1;
    if (it.danger) btn.classList.add('danger');
    const label = document.createElement('span');
    label.textContent = it.label;
    btn.appendChild(label);
    if (it.hint) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = it.hint;
      btn.appendChild(hint);
    }
    btn.addEventListener('click', () => {
      closeContextMenu();
      it.action();
    });
    ctxMenuEl.appendChild(btn);
  }
  document.body.appendChild(ctxMenuEl);
  const r = ctxMenuEl.getBoundingClientRect();
  ctxMenuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  ctxMenuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}

/** The root folder a note belongs to (library or a linked folder). */
function noteRoot(note) {
  const parent = note.path.replace(/[\\/][^\\/]+$/, '');
  if (!note.subdir) return parent;
  return parent.slice(0, parent.length - note.subdir.length - 1);
}

function setupContextMenus() {
  // Everything except the editor/preview loses the stock WebView2 menu —
  // the editor keeps it for cut/copy/paste and spellcheck suggestions.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#editor, #preview')) {
      closeContextMenu();
      return;
    }
    e.preventDefault();
    if (!e.target.closest('#sidebar')) closeContextMenu();
  });

  dom.sidebar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const noteEl = e.target.closest('.note-item');
    const subdirEl = e.target.closest('.subdir-header');
    const folderEl = e.target.closest('.folder-header');
    if (noteEl && noteEl._note) {
      showContextMenu(e.clientX, e.clientY, noteContextItems(noteEl._note, noteEl));
    } else if (subdirEl && subdirEl._subdir) {
      showContextMenu(e.clientX, e.clientY, subdirContextItems(subdirEl._subdir));
    } else if (folderEl && folderEl._folder) {
      showContextMenu(e.clientX, e.clientY, folderContextItems(folderEl._folder));
    } else {
      showContextMenu(e.clientX, e.clientY, generalContextItems());
    }
  });

  document.addEventListener('click', (e) => {
    if (ctxMenuEl && !e.target.closest('.context-menu')) closeContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
  });
}

function noteContextItems(note, noteEl) {
  const root = noteRoot(note);
  const isArchived = !!note._archiveRoot;
  const items = [
    { label: 'open', action: () => openNotePath(note.path) },
    { label: 'rename', action: () => startRename(note, noteEl) },
    { label: REVEAL_LABEL, action: () => invoke('show_in_explorer', { path: note.path }).catch(() => {}) },
    '-',
    isArchived
      ? { label: 'unarchive', action: () => moveNoteTo(note, note._archiveRoot, 'unarchived') }
      : { label: 'archive', action: () => moveNoteTo(note, root + '/archive', 'archived') },
  ];
  const destinations = [];
  if (state.notesRoot) destinations.push({ name: 'notes', path: state.notesRoot });
  for (const f of state.linkedFolders) destinations.push({ name: f.name, path: f.path });
  for (const dest of destinations) {
    // Skip where it already lives; for archived notes, "move to" its own
    // root is just unarchive, which is already listed.
    if (dest.path === root || (isArchived && dest.path === note._archiveRoot)) continue;
    items.push({ label: `move to ${dest.name}`, action: () => moveNoteTo(note, dest.path, `moved to ${dest.name}`) });
  }
  items.push('-', { label: 'delete', danger: true, action: () => deleteNote(note) });
  return items;
}

function folderContextItems(folder) {
  return [
    {
      label: folder.collapsed ? 'expand' : 'collapse',
      action: () => {
        folder.collapsed = !folder.collapsed;
        saveSettings();
        refreshNotes();
      },
    },
    { label: 'new note here', action: () => newFile(folder.path) },
    { label: REVEAL_LABEL, action: () => invoke('show_in_explorer', { path: folder.path }).catch(() => {}) },
    '-',
    {
      label: 'unlink folder',
      danger: true,
      action: () => {
        state.linkedFolders = state.linkedFolders.filter(f => f !== folder);
        saveSettings();
        refreshNotes();
        toast(`unlinked ${folder.name} — files untouched`);
      },
    },
  ];
}

function subdirContextItems(sub) {
  const expanded = !!state.expandedDirs[sub.key];
  return [
    {
      label: expanded ? 'collapse' : 'expand',
      action: () => {
        if (expanded) delete state.expandedDirs[sub.key];
        else state.expandedDirs[sub.key] = true;
        saveSettings();
        refreshNotes();
      },
    },
    { label: 'new note here', action: () => newFile(sub.path) },
    { label: REVEAL_LABEL, action: () => invoke('show_in_explorer', { path: sub.path }).catch(() => {}) },
  ];
}

function generalContextItems() {
  return [
    { label: 'new note', hint: keyLabel('Ctrl+N'), action: newFile },
    { label: 'link a folder…', action: linkFolder },
    { label: 'export to html', hint: keyLabel('Ctrl+Shift+E'), action: exportHtml },
    '-',
    { label: 'open notes folder', action: () => invoke('open_notes_dir').catch(() => {}) },
    { label: 'refresh', action: refreshNotes },
  ];
}

/* ---------- Note actions ---------- */
async function deleteNote(note) {
  try {
    await invoke('delete_note', { path: note.path });
    if (state.filePath === note.path) {
      // The buffer lives on as an unsaved document
      state.filePath = null;
      state.fileName = 'Untitled';
      state.dirty = true;
      updateTitlebar();
      updateSaveIndicator();
      saveSession();
    }
    toast(IS_MAC ? 'moved to trash' : 'moved to recycle bin');
  } catch (e) {
    toast(String(e));
  }
  refreshNotes();
}

async function moveNoteTo(note, destDir, message) {
  try {
    const newPath = await invoke('move_note', { path: note.path, destDir });
    if (state.filePath === note.path) {
      state.filePath = newPath;
      state.fileName = fileNameFromPath(newPath);
      updateTitlebar();
      saveSession();
    }
    toast(message);
  } catch (e) {
    toast(String(e));
  }
  refreshNotes();
}

function startRename(note, noteEl) {
  const nameEl = noteEl.querySelector('.note-name');
  if (!nameEl) return;
  const oldStem = note.name.replace(/\.(md|markdown|txt|text)$/i, '');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = oldStem;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const newStem = input.value.trim();
    if (!newStem || newStem === oldStem) {
      refreshNotes();
      return;
    }
    try {
      const newPath = await invoke('rename_note', { path: note.path, newName: newStem });
      if (state.filePath === note.path) {
        state.filePath = newPath;
        state.fileName = fileNameFromPath(newPath);
        updateTitlebar();
        saveSession();
      }
      toast('renamed');
    } catch (e) {
      toast(String(e));
    }
    refreshNotes();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      done = true;
      refreshNotes();
    }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('blur', commit);
}

async function openNotePath(path) {
  if (path === state.filePath) return;
  if (!(await confirmUnsaved())) return;
  try {
    const contents = await invoke('read_file', { path });
    loadDocument(path, contents);
    refreshNotes();
  } catch (e) {
    console.error('Failed to open note:', e);
  }
}

/* ---------- Editor layout (width / spacing / spellcheck) ---------- */
function applyEditorLayout() {
  const root = document.documentElement;
  // Custom advanced values (when set) override the presets.
  const width = state.customWidth ? state.customWidth + 'rem'
    : (EDITOR_WIDTHS[state.editorWidth] || EDITOR_WIDTHS.normal);
  const lh = state.customLineHeight ? String(state.customLineHeight)
    : (LINE_SPACINGS[state.lineSpacing] || LINE_SPACINGS.normal);
  root.style.setProperty('--editor-column', width);
  root.style.setProperty('--editor-lh', lh);
  syncLayers();
}

function applySpellcheck() {
  dom.editor.spellcheck = state.spellcheck;
}

/* ---------- Settings modal ---------- */
function setupSettings() {
  const overlay = $('#settings-overlay');

  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings-close').addEventListener('click', closeSettings);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });

  // Populate the font segment from FONTS
  const fontSeg = $('#set-font');
  for (const font of FONTS) {
    const btn = document.createElement('button');
    btn.tabIndex = -1;
    btn.dataset.v = font.id;
    btn.textContent = font.label;
    fontSeg.appendChild(btn);
  }

  const onSeg = (id, fn) => {
    $(id).addEventListener('click', (e) => {
      const v = e.target.dataset && e.target.dataset.v;
      if (v) fn(v);
    });
  };

  onSeg('#set-theme', (v) => {
    state.theme = v;
    applyTheme();
    updateThemeLabel();
    saveSettings();
    syncSettingsUI();
  });
  onSeg('#set-font', (v) => {
    setEditorFont(v);
    syncSettingsUI();
  });
  onSeg('#set-width', (v) => {
    // Picking a preset clears any custom override so the preset actually applies
    state.editorWidth = v;
    state.customWidth = null;
    applyEditorLayout();
    saveSettings();
    syncSettingsUI();
  });
  onSeg('#set-spacing', (v) => {
    state.lineSpacing = v;
    state.customLineHeight = null;
    applyEditorLayout();
    saveSettings();
    syncSettingsUI();
  });

  $('#set-size').addEventListener('click', (e) => {
    const d = e.target.dataset && e.target.dataset.d;
    if (d) changeFontSize(Number(d));
  });

  $('#set-typewriter').addEventListener('click', toggleTypewriter);
  $('#set-focus').addEventListener('click', toggleFocusMode);
  $('#set-spellcheck').addEventListener('click', () => {
    state.spellcheck = !state.spellcheck;
    applySpellcheck();
    saveSettings();
    syncSettingsUI();
  });
  $('#set-autohide').addEventListener('click', () => {
    state.chromeAutoHide = !state.chromeAutoHide;
    if (!state.chromeAutoHide) showChrome();
    saveSettings();
    syncSettingsUI();
  });
  $('#btn-open-notes-dir').addEventListener('click', () => {
    invoke('open_notes_dir').catch((e) => console.error('Failed to open notes folder:', e));
  });
  $('#set-discord').addEventListener('click', () => {
    state.discordPresence = !state.discordPresence;
    invoke('discord_set_enabled', { enabled: state.discordPresence }).catch(() => {});
    if (!state.discordPresence) toast('discord presence off');
    saveSettings();
    syncSettingsUI();
  });

  // Advanced disclosure
  $('#advanced-toggle').addEventListener('click', () => {
    $('#advanced-group').classList.toggle('collapsed');
  });
  $('#pick-font').addEventListener('click', pickCustomFont);
  $('#clear-font').addEventListener('click', clearCustomFont);

  const sysFont = $('#system-font');
  sysFont.addEventListener('keydown', (e) => e.stopPropagation());
  sysFont.addEventListener('change', async () => {
    const opt = sysFont.selectedOptions[0];
    if (!opt || !opt.value) return;
    const res = await invoke('read_font_file', { path: opt.value }).catch(() => null);
    if (!res) {
      toast('could not read that font');
      sysFont.value = '';
      return;
    }
    await applyCustomFontData(opt.dataset.name || res.name, res.data);
  });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const lhInput = $('#custom-lh');
  lhInput.addEventListener('input', () => {
    const v = parseFloat(lhInput.value);
    state.customLineHeight = (lhInput.value.trim() === '' || isNaN(v)) ? null : clamp(v, 1, 3);
    applyEditorLayout();
    saveSettings();
  });
  lhInput.addEventListener('change', () => {
    lhInput.value = state.customLineHeight ?? '';
  });

  const widthInput = $('#custom-width');
  widthInput.addEventListener('input', () => {
    const v = parseFloat(widthInput.value);
    state.customWidth = (widthInput.value.trim() === '' || isNaN(v)) ? null : clamp(v, 24, 120);
    applyEditorLayout();
    saveSettings();
  });
  widthInput.addEventListener('change', () => {
    widthInput.value = state.customWidth ?? '';
  });

  // Keep custom inputs from triggering editor shortcuts
  [lhInput, widthInput].forEach(el => el.addEventListener('keydown', (e) => e.stopPropagation()));
}

function openSettings() {
  syncSettingsUI();
  populateSystemFonts();
  $('#settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  const overlay = $('#settings-overlay');
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  dom.editor.focus();
}

function syncSettingsUI() {
  const selSeg = (id, val) => {
    document.querySelectorAll(`${id} button`).forEach(b =>
      b.classList.toggle('selected', b.dataset.v === val));
  };
  const setToggle = (id, on) => {
    const el = $(id);
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
  };

  selSeg('#set-theme', state.theme);
  selSeg('#set-font', state.editorFont);
  selSeg('#set-width', state.editorWidth);
  selSeg('#set-spacing', state.lineSpacing);
  $('#set-size-value').textContent = state.fontSize + 'px';
  setToggle('#set-typewriter', state.typewriterMode);
  setToggle('#set-focus', state.focusMode);
  setToggle('#set-spellcheck', state.spellcheck);
  setToggle('#set-autohide', state.chromeAutoHide);
  setToggle('#set-discord', state.discordPresence);

  // Advanced
  $('#custom-font-name').textContent = state.customFont ? state.customFont.name : '';
  $('#pick-font').textContent = state.customFont ? 'replace…' : 'choose file…';
  $('#clear-font').classList.toggle('hidden', !state.customFont);
  const sysSel = $('#system-font');
  const sysMatch = state.customFont &&
    [...sysSel.options].find(o => o.dataset.name === state.customFont.name);
  sysSel.value = sysMatch ? sysMatch.value : '';
  const lhInput = $('#custom-lh');
  if (document.activeElement !== lhInput) lhInput.value = state.customLineHeight ?? '';
  const widthInput = $('#custom-width');
  if (document.activeElement !== widthInput) widthInput.value = state.customWidth ?? '';
}

/* ---------- Font size ---------- */
function applyFontSize() {
  document.documentElement.style.setProperty('--editor-size', state.fontSize + 'px');
}

function changeFontSize(delta) {
  state.fontSize = Math.max(12, Math.min(32, state.fontSize + delta));
  applyFontSize();
  syncLayers();
  saveSettings();
  syncSettingsUI();
}

function resetFontSize() {
  state.fontSize = 18;
  applyFontSize();
  syncLayers();
  saveSettings();
  syncSettingsUI();
}

/* ---------- Editor events ---------- */
function setupEditorEvents() {
  dom.editor.addEventListener('input', onEditorChange);
  dom.editor.addEventListener('paste', onEditorPaste);
  dom.editor.addEventListener('click', onCaretMove);
  dom.editor.addEventListener('keyup', onCaretMove);
  dom.editor.addEventListener('keydown', onEditorKeyDown);
  document.addEventListener('keydown', onKeyDown);
}

/* ---------- Tab = indent (not focus navigation) ---------- */
const INDENT = '    ';

function onEditorKeyDown(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();

  const ta = dom.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const multiline = text.slice(start, end).includes('\n');

  // Plain Tab with a caret or single-line selection: insert spaces
  if (!e.shiftKey && !multiline) {
    replaceRange(start, end, INDENT);
    return;
  }

  // Shift+Tab or multi-line selection: indent/outdent whole lines
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;

  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const newBlock = e.shiftKey
    ? lines.map(l => l.replace(/^(?: {1,4}|\t)/, '')).join('\n')
    : lines.map(l => INDENT + l).join('\n');
  if (newBlock === block) return;

  replaceRange(lineStart, lineEnd, newBlock);
  if (lines.length === 1) {
    // Keep the caret on the same spot in the line it started on
    const delta = block.length - newBlock.length;
    const pos = Math.max(lineStart, start - delta);
    ta.selectionStart = ta.selectionEnd = pos;
  } else {
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + newBlock.length;
  }
}

function onEditorChange() {
  state.dirty = true;
  updateSaveIndicator();
  updateBackdrop();
  updateStats();
  saveSession();
  scheduleChromeHide();
  if (find.open) {
    if (document.activeElement === dom.editor) find.desiredPos = dom.editor.selectionStart;
    updateFind();
  }
  if (state.typewriterMode) {
    requestAnimationFrame(scrollToCaretCenter);
  }
}

function onCaretMove() {
  updateFocusParagraph();
  if (state.typewriterMode) scrollToCaretCenter();
}

function updateBackdrop() {
  dom.backdrop.innerHTML = Markdown.render(dom.editor.value);
  // Mark the active line BEFORE syncLayers() forces a layout flush. The line
  // divs were just recreated; if the flush commits their default dimmed
  // opacity first, adding .focus-active afterward animates 0.25→1 and the
  // caret line flickers on every keystroke. Setting the class first means the
  // node's initial computed opacity is 1 — and initial styles don't transition.
  updateFocusParagraph();
  syncLayers();
}

function syncLayers() {
  // The textarea auto-grows; the outer #editor-area does the scrolling.
  dom.editor.style.height = 'auto';
  const h = dom.editor.scrollHeight;
  dom.editor.style.height = h + 'px';
  dom.backdrop.style.minHeight = h + 'px';
  $('#find-layer').style.minHeight = h + 'px';
}

/* ---------- Caret measurement ----------
   A hidden mirror with identical metrics (see styles.css) receives the
   text up to the caret plus a marker span; the marker's offsetTop is the
   caret's Y position. Handles soft-wrapped lines correctly, unlike
   counting '\n'. */
let caretMirror = null;

function measureCaretY() {
  if (!caretMirror) {
    caretMirror = document.createElement('div');
    caretMirror.id = 'caret-mirror';
    caretMirror.setAttribute('aria-hidden', 'true');
    dom.editorWrapper.appendChild(caretMirror);
  }
  caretMirror.textContent = dom.editor.value.substring(0, dom.editor.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = String.fromCharCode(0x200b); // zero-width space
  caretMirror.appendChild(marker);
  const y = marker.offsetTop;
  caretMirror.textContent = '';
  return y;
}

/* ---------- Stats ---------- */
function updateStats() {
  const text = dom.editor.value;
  const chars = text.length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)); // 200 wpm avg

  dom.wordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  dom.charCount.textContent = `· ${chars} ${chars === 1 ? 'char' : 'chars'}`;
  dom.readingTime.textContent = `· ${minutes} min read`;
}

/* ---------- Titlebar ---------- */
function updateTitlebar() {
  dom.filenameText.textContent = state.fileName;
}

function updateSaveIndicator() {
  // "— edited" appears next to the filename while there are unsaved changes,
  // the way native word processors show it. Cleared on save.
  dom.unsavedLabel.classList.toggle('hidden', !state.dirty);
}

function fileNameFromPath(path) {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'Untitled';
}

function parentDir(path) {
  return path.replace(/[\\/][^\\/]+$/, '');
}

/* ---------- Window controls ---------- */
function setupWindowControls() {
  dom.btnMin.addEventListener('click', () => invoke('minimize_window'));
  dom.btnMax.addEventListener('click', () => invoke('toggle_maximize_window'));
  dom.btnClose.addEventListener('click', () => handleClose());

  // Native close paths — the macOS traffic-light ✕ and the Cmd+W menu item
  // (Alt+F4 on Windows likewise) — go through the same unsaved-changes flow
  // as the custom ✕ button. Registering this listener makes Tauri hold the
  // close; handleClose() finishes it via close_window (which destroys).
  try {
    const win = window.__TAURI__?.window?.getCurrentWindow?.();
    win?.onCloseRequested?.((event) => {
      event.preventDefault();
      handleClose();
    });
  } catch (_) { /* window API unavailable — custom ✕ still works */ }

  // The whole titlebar drags the window; double-click toggles maximize
  dom.titlebar.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    if (e.detail === 2) {
      invoke('toggle_maximize_window');
    } else {
      invoke('start_dragging');
    }
  });

  window.addEventListener('resize', updateMaximizeIcon);
}

function updateMaximizeIcon() {
  invoke('is_maximized').then(isMax => {
    document.body.classList.toggle('is-maximized', !!isMax);
    dom.btnMax.title = isMax ? 'Restore' : 'Maximize';
  }).catch(() => {});
}

/**
 * If the buffer has unsaved changes, ask Save / Don't Save / Cancel.
 * Returns true when it's safe to proceed (saved or explicitly discarded).
 */
async function confirmUnsaved() {
  if (!state.dirty) return true;
  const choice = await invoke('confirm_save', { fileName: state.fileName });
  if (choice === 'save') {
    await saveFile();
    return !state.dirty; // still dirty = the save-as dialog was cancelled
  }
  return choice === 'discard';
}

async function handleClose() {
  if (!(await confirmUnsaved())) return;
  // confirmUnsaved() only returns true with state.dirty still true when the
  // user chose "Don't Save" — nothing else resets it. The continuously-saved
  // session already holds the discarded text, so it must be cleaned up now or
  // it comes back on next launch (a data-privacy bug).
  if (state.dirty) {
    if (state.filePath) {
      // Keep the file open next launch, but restore only its on-disk content.
      try {
        const onDisk = await invoke('read_file', { path: state.filePath });
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          content: onDisk,
          filePath: state.filePath,
        }));
      } catch (_) {
        clearSession();
      }
    } else {
      clearSession();
    }
  } else {
    saveSession();
  }
  invoke('close_window');
}

/* ---------- File operations ---------- */
function loadDocument(path, contents) {
  state.filePath = path;
  state.fileName = path ? fileNameFromPath(path) : 'Untitled';
  state.dirty = false;
  dom.editor.value = contents;
  updateTitlebar();
  updateSaveIndicator();
  updateBackdrop();
  updateStats();
  saveSession();
  dom.editorArea.scrollTop = 0;
  dom.editor.focus();
  scheduleChromeHide(); // fresh document = ready to write, chrome fades
  // A different document is now active: reset the Discord elapsed-time
  // clock and roll a new flavor line. Carries no filename or contents.
  invoke('discord_session_start').catch(() => {});
  if (state.sidebarVisible) refreshNotes();
}

async function newFile(startDir) {
  if (!(await confirmUnsaved())) return;
  // A new note belongs to the folder you're working in: the one you
  // right-clicked, or the current note's folder — not always the library.
  state.newNoteDir = (typeof startDir === 'string' && startDir) ||
    (state.filePath ? parentDir(state.filePath) : state.newNoteDir);
  loadDocument(null, '');
  // A new note means writing, not browsing — get the sidebar out of the way
  if (state.sidebarVisible) {
    state.sidebarVisible = false;
    applySidebar();
    saveSettings();
  }
}

async function openFile() {
  if (!(await confirmUnsaved())) return;
  const path = await invoke('open_file_dialog');
  if (!path) return;
  try {
    const contents = await invoke('read_file', { path });
    loadDocument(path, contents);
  } catch (e) {
    console.error('Failed to open file:', e);
  }
}

async function saveFile() {
  if (state.filePath) {
    try {
      await invoke('write_file', { path: state.filePath, contents: dom.editor.value });
      state.dirty = false;
      updateSaveIndicator();
      saveSession();
      if (state.sidebarVisible) refreshNotes();
    } catch (e) {
      console.error('Failed to save file:', e);
    }
  } else {
    await saveFileAs();
  }
}

async function saveFileAs() {
  const path = await invoke('save_file_dialog', {
    defaultName: state.fileName === 'Untitled' ? 'Untitled.md' : state.fileName,
    currentPath: state.filePath,
    startDir: state.filePath ? null : state.newNoteDir,
  });
  if (!path) return;
  try {
    await invoke('write_file', { path, contents: dom.editor.value });
    state.filePath = path;
    state.fileName = fileNameFromPath(path);
    state.dirty = false;
    updateTitlebar();
    updateSaveIndicator();
    saveSession();
    if (state.sidebarVisible) refreshNotes();
  } catch (e) {
    console.error('Failed to save file:', e);
  }
}

/* ---------- Modes ---------- */
function applyModes() {
  dom.editorWrapper.classList.toggle('focus-mode', state.focusMode);
  document.documentElement.classList.toggle('typewriter-mode', state.typewriterMode);
}

function updateModeLabel() {
  const active = [];
  if (state.typewriterMode) active.push('typewriter');
  if (state.focusMode) active.push('focus');
  dom.modeLabel.textContent = active.join(' · ');
  dom.modeLabel.classList.toggle('hidden', active.length === 0);
}

function toggleTypewriter() {
  state.typewriterMode = !state.typewriterMode;
  applyModes();
  if (state.typewriterMode) {
    // Let the runway (--editor-top: 50vh) reflow before measuring/scrolling
    requestAnimationFrame(scrollToCaretCenter);
  } else {
    dom.editor.focus();
  }
  updateModeLabel();
  saveSettings();
  syncSettingsUI();
}

function scrollToCaretCenter() {
  const caretY = measureCaretY();
  const lineH = parseFloat(getComputedStyle(dom.editor).lineHeight) || state.fontSize * 1.75;
  const target = dom.editor.offsetTop + caretY - (dom.editorArea.clientHeight - lineH) / 2;
  dom.editorArea.scrollTop = Math.max(0, target);
}

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  applyModes();
  if (state.focusMode) {
    updateFocusParagraph();
  } else {
    dom.backdrop.querySelectorAll('.focus-active').forEach(el => el.classList.remove('focus-active'));
  }
  updateModeLabel();
  saveSettings();
  syncSettingsUI();
}

function updateFocusParagraph() {
  if (!state.focusMode) return;
  const textBefore = dom.editor.value.substring(0, dom.editor.selectionStart);
  const currentLine = textBefore.split('\n').length - 1;

  dom.backdrop.querySelectorAll('.focus-active').forEach(el => el.classList.remove('focus-active'));
  const lineEl = dom.backdrop.querySelector(`[data-line="${currentLine}"]`);
  if (lineEl) {
    lineEl.classList.add('focus-active');
  }
}

function togglePreview() {
  state.previewMode = !state.previewMode;
  if (state.previewMode) {
    closeFind();
    dom.preview.innerHTML = Markdown.renderPreview(dom.editor.value);
    hydrateImages(dom.preview); // async — local images pop in as they load
    dom.preview.classList.remove('hidden');
    dom.preview.classList.add('fade-in-up');
    dom.editorWrapper.classList.add('hidden');
    dom.editorArea.scrollTop = 0;
  } else {
    dom.preview.classList.add('hidden');
    dom.preview.classList.remove('fade-in-up');
    dom.editorWrapper.classList.remove('hidden');
    dom.editor.focus();
  }
  showChrome();
}

/* ---------- Export to HTML ----------
   Produces a standalone, self-contained .html document (embedded CSS, no
   external assets) suitable for publishing or sharing. */
function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function deriveTitle() {
  const m = dom.editor.value.match(/^\s*#\s+(.+?)\s*$/m);
  if (m) return m[1].replace(/[*_`]/g, '').trim();
  const stem = state.fileName.replace(/\.(md|markdown|txt|text)$/i, '').trim();
  return stem || 'Untitled';
}

function buildHtmlDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escAttr(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.125rem;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fafafa;
    margin: 0;
    padding: 4rem 1.5rem;
  }
  main { max-width: 42rem; margin: 0 auto; }
  h1, h2, h3, h4, h5, h6 {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    line-height: 1.25; margin: 2.5rem 0 1rem; font-weight: 700;
  }
  h1 { font-size: 2rem; margin-top: 0; }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.25rem; }
  p { margin: 1rem 0; }
  a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  code {
    font-family: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
    font-size: 0.88em; background: rgba(0,0,0,0.06);
    padding: 0.15em 0.35em; border-radius: 4px;
  }
  pre {
    background: rgba(0,0,0,0.06); padding: 1rem; border-radius: 8px;
    overflow-x: auto; font-size: 0.95rem;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    border-left: 3px solid #d4d4d4; margin: 1.5rem 0; padding-left: 1rem;
    color: #555; font-style: italic;
  }
  ul, ol { padding-left: 1.5rem; }
  li { margin: 0.35rem 0; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 2.5rem auto; width: 8rem; }
  img { max-width: 100%; border-radius: 6px; }
  .img-missing {
    display: inline-block; padding: 0.3em 0.6em; border: 1px dashed #d4d4d4;
    border-radius: 6px; font-size: 0.85em; font-style: italic; color: #999;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e5e5; background: #191919; }
    a { color: #60a5fa; }
    code, pre { background: rgba(255,255,255,0.08); }
    blockquote { border-left-color: #404040; color: #a3a3a3; }
    hr { border-top-color: #2a2a2a; }
  }
</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>
`;
}

async function exportHtml() {
  if (state.previewMode) togglePreview();
  if (!dom.editor.value.trim()) { toast('nothing to export'); return; }
  const title = deriveTitle();
  const body = document.createElement('div');
  body.innerHTML = Markdown.renderPreview(dom.editor.value);
  await hydrateImages(body); // embed local images as data: URIs — stays self-contained
  const full = buildHtmlDocument(title, body.innerHTML);
  const stem = state.fileName.replace(/\.(md|markdown|txt|text)$/i, '') || 'Untitled';
  const path = await invoke('save_html_dialog', { defaultName: stem + '.html' });
  if (!path) return;
  try {
    await invoke('write_file', { path, contents: full });
    toast('exported to html');
  } catch (e) {
    toast(String(e));
  }
}

/* ---------- Bold / Italic shortcuts ---------- */

/** Replace [start, end) with newText, preserving the native undo stack. */
function replaceRange(start, end, newText) {
  dom.editor.focus();
  dom.editor.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, newText)) {
    dom.editor.setRangeText(newText, start, end, 'end');
    onEditorChange();
  }
}

function wrapSelection(wrapper) {
  const ta = dom.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;

  if (start === end) {
    // No selection: insert the markers with the cursor between them
    replaceRange(start, end, wrapper + wrapper);
    ta.selectionStart = ta.selectionEnd = start + wrapper.length;
  } else {
    const selected = text.slice(start, end);
    if (selected.startsWith(wrapper) && selected.endsWith(wrapper) && selected.length >= wrapper.length * 2) {
      // Already wrapped: unwrap
      replaceRange(start, end, selected.slice(wrapper.length, -wrapper.length));
      ta.selectionStart = start;
      ta.selectionEnd = end - wrapper.length * 2;
    } else {
      replaceRange(start, end, wrapper + selected + wrapper);
      ta.selectionStart = start;
      ta.selectionEnd = end + wrapper.length * 2;
    }
  }
}

/** Wrap the selection as a markdown link: [selection](caret-here) */
function wrapLink() {
  const ta = dom.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end);
  replaceRange(start, end, '[' + selected + ']()');
  const pos = start + selected.length + 3; // between the parentheses
  ta.selectionStart = ta.selectionEnd = pos;
}

/* ---------- Images (Obsidian-style attachments) ----------
   Pasted or dropped images are copied into the folder of the current note
   (the way Obsidian stores attachments) and embedded as ![[name]]. The
   preview resolves local embeds to data: URIs via the Rust read_image
   command, so no filesystem access happens from JS. */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];
const TXT_EXTS = ['txt', 'md', 'markdown', 'text'];

function noteDir() {
  return state.filePath ? state.filePath.replace(/[\\/][^\\/]+$/, '') : null;
}

function extOf(path) {
  const m = /\.([^.\\/]+)$/.exec(path);
  return m ? m[1].toLowerCase() : '';
}

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000; // avoid call-stack limits on large images
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function insertAtCaret(text) {
  replaceRange(dom.editor.selectionStart, dom.editor.selectionEnd, text);
}

function pastedImageName(mime) {
  const ext = ({
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
    'image/avif': 'avif',
  })[mime] || 'png';
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
                pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  return `Pasted image ${stamp}.${ext}`; // Obsidian's naming convention
}

async function onEditorPaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  let file = null;
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      file = it.getAsFile();
      break;
    }
  }
  if (!file) return; // no image on the clipboard — native paste proceeds
  e.preventDefault();
  const dir = noteDir();
  if (!dir) {
    toast('save the note first — images are stored next to it');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = await invoke('save_image', {
      dir,
      name: pastedImageName(file.type),
      data: bytesToBase64(bytes),
    });
    insertAtCaret(`![[${name}]]`);
    toast('image saved next to the note');
  } catch (err) {
    toast(String(err));
  }
}

async function importDroppedImage(path) {
  const dir = noteDir();
  if (!dir) {
    toast('save the note first — images are stored next to it');
    return;
  }
  try {
    const name = await invoke('import_image', { dir, srcPath: path });
    insertAtCaret(`![[${name}]]`);
    toast('image copied next to the note');
  } catch (err) {
    toast(String(err));
  }
}

/** Resolve <img data-msrc> placeholders (local images) to data: URIs.
    Relative paths resolve against the current note's folder. */
async function hydrateImages(container) {
  const dir = noteDir();
  const cache = new Map(); // same image embedded twice → one disk read
  for (const img of container.querySelectorAll('img[data-msrc]')) {
    const raw = img.getAttribute('data-msrc');
    let rel = raw;
    try { rel = decodeURIComponent(raw); } catch (_) { /* keep raw */ }
    const absolute = /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(rel);
    const full = absolute ? rel : (dir ? dir + '/' + rel : null);
    let src = null;
    if (full) {
      try {
        if (!cache.has(full)) cache.set(full, await invoke('read_image', { path: full }));
        src = cache.get(full);
      } catch (_) { /* fall through to the placeholder */ }
    }
    if (src) {
      img.src = src;
      img.removeAttribute('data-msrc');
    } else {
      const missing = document.createElement('span');
      missing.className = 'img-missing';
      missing.textContent = `image not found: ${rel}`;
      img.replaceWith(missing);
    }
  }
}

/* ---------- Find & replace ---------- */
const find = {
  open: false,
  matchCase: false,
  matches: [],   // [{ start, end }]
  current: 0,
  desiredPos: 0, // keep "current" near this text offset across recomputes
};

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setupFind() {
  const input = $('#find-input');
  const replaceInput = $('#replace-input');

  input.addEventListener('input', () => {
    find.desiredPos = find.matches[find.current] ? find.matches[find.current].start : dom.editor.selectionStart;
    updateFind();
  });

  const onFindKeys = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.target === replaceInput) replaceCurrent();
      else findStep(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      closeFind();
    } else if (e.key === 'F3') {
      e.preventDefault();
      findStep(e.shiftKey ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) &&
               (e.key.toLowerCase() === 'h' || (IS_MAC && e.altKey && e.code === 'KeyF'))) {
      e.preventDefault();
      setReplaceVisible(true);
      replaceInput.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  };
  input.addEventListener('keydown', onFindKeys);
  replaceInput.addEventListener('keydown', onFindKeys);

  $('#find-next').addEventListener('click', () => findStep(1));
  $('#find-prev').addEventListener('click', () => findStep(-1));
  $('#find-close').addEventListener('click', closeFind);
  $('#find-case').addEventListener('click', () => {
    find.matchCase = !find.matchCase;
    $('#find-case').classList.toggle('active', find.matchCase);
    updateFind();
    input.focus();
  });
  $('#find-toggle-replace').addEventListener('click', () => {
    setReplaceVisible($('#replace-row').classList.contains('hidden'));
  });
  $('#replace-one').addEventListener('click', replaceCurrent);
  $('#replace-all').addEventListener('click', replaceAll);
}

function openFind(withReplace) {
  if (state.previewMode) return;
  const input = $('#find-input');
  const selected = dom.editor.value.slice(dom.editor.selectionStart, dom.editor.selectionEnd);
  if (selected && !selected.includes('\n')) input.value = selected;
  find.open = true;
  find.desiredPos = dom.editor.selectionStart;
  $('#find-bar').classList.remove('hidden');
  setReplaceVisible(!!withReplace);
  updateFind();
  input.focus();
  input.select();
  showChrome();
}

function closeFind() {
  if (!find.open) return;
  find.open = false;
  $('#find-bar').classList.add('hidden');
  $('#find-layer').textContent = '';
  // Land the caret on the current match so writing resumes there
  const m = find.matches[find.current];
  dom.editor.focus();
  if (m) dom.editor.setSelectionRange(m.start, m.end);
}

function setReplaceVisible(visible) {
  $('#replace-row').classList.toggle('hidden', !visible);
  $('#find-bar').classList.toggle('replace-open', visible);
}

function computeMatches() {
  find.matches = [];
  const q = $('#find-input').value;
  if (!q) return;
  const text = dom.editor.value;
  const hay = find.matchCase ? text : text.toLowerCase();
  const needle = find.matchCase ? q : q.toLowerCase();
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1 && find.matches.length < 5000) {
    find.matches.push({ start: i, end: i + needle.length });
    i += needle.length;
  }
}

function updateFind() {
  if (!find.open) return;
  computeMatches();
  // Snap "current" to the first match at/after the position we care about
  find.current = 0;
  for (let i = 0; i < find.matches.length; i++) {
    if (find.matches[i].start >= find.desiredPos) {
      find.current = i;
      break;
    }
  }
  renderFindLayer();
  scrollToCurrentMatch();
}

function findStep(dir) {
  const n = find.matches.length;
  if (n === 0) return;
  find.current = (find.current + dir + n) % n;
  find.desiredPos = find.matches[find.current].start;
  renderFindLayer();
  scrollToCurrentMatch();
}

function renderFindLayer() {
  const layer = $('#find-layer');
  const countEl = $('#find-count');
  if (find.matches.length === 0) {
    layer.textContent = '';
    countEl.textContent = $('#find-input').value ? 'no matches' : '';
    return;
  }
  countEl.textContent = `${find.current + 1} of ${find.matches.length}`;
  const text = dom.editor.value;
  let html = '';
  let last = 0;
  find.matches.forEach((m, i) => {
    html += escHtml(text.slice(last, m.start)) +
      `<mark${i === find.current ? ' class="current"' : ''}>` +
      escHtml(text.slice(m.start, m.end)) + '</mark>';
    last = m.end;
  });
  html += escHtml(text.slice(last));
  layer.innerHTML = html;
}

function scrollToCurrentMatch() {
  const layer = $('#find-layer');
  const el = layer.querySelectorAll('mark')[find.current];
  if (!el) return;
  const area = dom.editorArea;
  const y = layer.offsetTop + el.offsetTop;
  if (y < area.scrollTop + 60 || y > area.scrollTop + area.clientHeight - 100) {
    area.scrollTop = Math.max(0, y - area.clientHeight / 2);
  }
}

function replaceCurrent() {
  const m = find.matches[find.current];
  if (!m) return;
  const rep = $('#replace-input').value;
  find.desiredPos = m.start + rep.length;
  replaceRange(m.start, m.end, rep); // fires input → onEditorChange → updateFind
  $('#replace-input').focus();
}

function replaceAll() {
  if (find.matches.length === 0) return;
  const rep = $('#replace-input').value;
  const text = dom.editor.value;
  const count = find.matches.length;
  let out = '';
  let last = 0;
  for (const m of find.matches) {
    out += text.slice(last, m.start) + rep;
    last = m.end;
  }
  out += text.slice(last);
  replaceRange(0, text.length, out); // one undo step
  $('#replace-input').focus();
  toast(`replaced ${count} ${count === 1 ? 'match' : 'matches'}`);
}

/* ---------- Chrome auto-hide ----------
   iA-style calm: the bars are hidden whenever you're just sitting in the
   editor — typing OR idle with the caret blinking. Any mouse movement
   brings them back; once the pointer rests, they fade again. */
let chromeHideTimeout = null;

function setupChromeAutoHide() {
  document.addEventListener('mousemove', () => {
    showChrome();
    scheduleChromeHide();
  });
  // hideChrome declines while the pointer is on a bar; re-arm on leaving
  [dom.titlebar, dom.statusbar].forEach(el =>
    el.addEventListener('mouseleave', scheduleChromeHide));
  // The app opens ready to write: chrome fades out from the start
  scheduleChromeHide();
}

function scheduleChromeHide() {
  if (!state.chromeAutoHide) return;
  clearTimeout(chromeHideTimeout);
  chromeHideTimeout = setTimeout(hideChrome, 1200);
}

function showChrome() {
  clearTimeout(chromeHideTimeout);
  if (!state.chromeVisible) {
    state.chromeVisible = true;
    dom.titlebar.classList.remove('hidden-chrome');
    dom.statusbar.classList.remove('hidden-chrome');
  }
}

function hideChrome() {
  if (!state.chromeVisible || document.activeElement !== dom.editor || state.previewMode) return;
  // Never yank the bars away while the pointer is actually using them,
  // or while the font menu (which lives in the titlebar) is open.
  if (dom.titlebar.matches(':hover') || dom.statusbar.matches(':hover') ||
      dom.sidebar.matches(':hover') || !dom.fontMenu.classList.contains('hidden')) return;
  state.chromeVisible = false;
  dom.titlebar.classList.add('hidden-chrome');
  dom.statusbar.classList.add('hidden-chrome');
}

/* ---------- Keyboard shortcuts ---------- */
function onKeyDown(e) {
  const ctrl = e.ctrlKey || e.metaKey;

  if (e.key === 'F3' && find.open) {
    e.preventDefault();
    findStep(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === 'Escape' && find.open && document.activeElement === dom.editor) {
    closeFind();
    return;
  }
  if (!ctrl) return;

  const key = e.key.toLowerCase();

  // ⌥⌘F opens replace on macOS — ⌘H belongs to the system Hide command
  // there. (e.code, because Option rewrites e.key to "ƒ".)
  if (IS_MAC && e.altKey && e.code === 'KeyF') {
    e.preventDefault();
    openFind(true);
    return;
  }

  if (key === 'n') {
    e.preventDefault();
    newFile();
  } else if (key === 'o') {
    e.preventDefault();
    openFile();
  } else if (key === 's') {
    e.preventDefault();
    if (e.shiftKey) saveFileAs(); else saveFile();
  } else if (key === 'e' && e.shiftKey) {
    e.preventDefault();
    exportHtml();
  } else if (key === 'e') {
    e.preventDefault();
    togglePreview();
  } else if (key === 't') {
    e.preventDefault();
    toggleTypewriter();
    updateModeLabel();
  } else if (key === 'f' && e.shiftKey) {
    e.preventDefault();
    toggleFocusMode();
  } else if (key === 'b') {
    e.preventDefault();
    wrapSelection('**');
  } else if (key === 'i' && !e.shiftKey) {
    e.preventDefault();
    wrapSelection('*');
  } else if (key === 'k') {
    // Obsidian convention: wrap selection as a markdown link
    e.preventDefault();
    wrapLink();
  } else if (key === 'f' && !e.shiftKey) {
    e.preventDefault();
    openFind(false);
  } else if (key === 'h') {
    e.preventDefault();
    openFind(true);
  } else if (key === ',') {
    // VS Code/Obsidian/Zed convention: settings
    e.preventDefault();
    if ($('#settings-overlay').classList.contains('hidden')) openSettings();
    else closeSettings();
  } else if (key === 'w') {
    e.preventDefault();
    handleClose();
  } else if (key === 'd') {
    e.preventDefault();
    toggleSidebar();
  } else if (key === 'l' && e.shiftKey) {
    e.preventDefault();
    cycleTheme();
  } else if (key === '=' || key === '+') {
    e.preventDefault();
    changeFontSize(1);
  } else if (key === '-') {
    e.preventDefault();
    changeFontSize(-1);
  } else if (key === '0') {
    e.preventDefault();
    resetFontSize();
  }
}

/* ---------- Drag & drop ----------
   Tauri intercepts OS file drops (dragDropEnabled) and reports the paths via
   its own event; the HTML5 handler stays as a fallback for environments where
   it doesn't. Text files open; image files are copied next to the current
   note and embedded, Obsidian-style. */
function setupDragDrop() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const paths = Array.from(e.dataTransfer?.files || []).map(f => f.path).filter(Boolean);
    if (paths.length) handleDroppedPaths(paths);
  });

  try {
    window.__TAURI__?.event?.listen('tauri://drag-drop', (e) => {
      const paths = (e.payload && e.payload.paths) || [];
      if (paths.length) handleDroppedPaths(paths);
    });
  } catch (_) { /* event API unavailable — the HTML5 fallback above applies */ }
}

async function handleDroppedPaths(paths) {
  const textPath = paths.find(p => TXT_EXTS.includes(extOf(p)));
  if (textPath) {
    if (!(await confirmUnsaved())) return;
    try {
      const contents = await invoke('read_file', { path: textPath });
      loadDocument(textPath, contents);
    } catch (err) {
      console.error('Failed to open dropped file:', err);
    }
    return;
  }
  for (const p of paths.filter(p => IMAGE_EXTS.includes(extOf(p)))) {
    await importDroppedImage(p);
  }
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  init();
  setupDragDrop();
  updateMaximizeIcon();
  dom.editor.focus();
});
