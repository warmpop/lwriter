use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const TXT_EXTENSIONS: &[&str] = &["txt", "md", "markdown", "text"];

const GUIDE_NAME: &str = "lwriter guide.md";
const GUIDE_CONTENT: &str = "\
# lwriter guide

welcome to lwriter — a calm, distraction-free writing app.

## the basics

- your notes live in this folder: Documents\\lwriter
- toggle the sidebar with Ctrl+D to browse them
- right-click a note in the sidebar to rename, archive, move, or delete it
- archived notes stay in the collapsible \"archived\" section at the bottom of the sidebar
- link an Obsidian vault (folder icon in the sidebar header) to edit it in place —
  subfolders show up as collapsible sections
- paste or drop an image into a saved note to embed it; the file is stored
  next to the note, Obsidian-style (press Ctrl+E to see it rendered)
- your session is saved as you type — unsaved work survives restarts
- the title and status bars fade while you write; move the mouse to bring them back

## markdown

lwriter styles markdown as you type:

# headings
**bold**, *italic*, `code`, ~~strikethrough~~
> quotes
- lists
[links](https://example.com)

press Ctrl+E to see the rendered document.

## shortcuts

- Ctrl+N / Ctrl+O — new / open
- Ctrl+S / Ctrl+Shift+S — save / save as
- Ctrl+D — notes sidebar
- Ctrl+E — preview
- Ctrl+Shift+E — export to html
- Ctrl+T — typewriter mode (keeps the caret line centered)
- Ctrl+Shift+F — focus mode (dims everything but the current line)
- Ctrl+B / Ctrl+I — bold / italic
- Ctrl+K — insert a markdown link
- Ctrl+F / Ctrl+H — find / find & replace
- Ctrl+, — settings
- Ctrl+W — close
- Ctrl+Shift+L — cycle theme (auto follows Windows)
- Ctrl+= / Ctrl+- / Ctrl+0 — font size
- Tab / Shift+Tab — indent / outdent

## make it yours

open settings (the gear at the top of the sidebar) to change the theme,
editor font, font size, line width, line spacing, and more.
";

/// The notes library: Documents\lwriter. Created on first use,
/// seeded with the guide note.
fn notes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("No documents folder: {e}"))?
        .join("lwriter");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Could not create notes folder: {e}"))?;
        // First run: give the library its one starter note
        let _ = fs::write(dir.join(GUIDE_NAME), GUIDE_CONTENT);
    }
    Ok(dir)
}

#[derive(serde::Serialize)]
struct NoteMeta {
    name: String,
    path: String,
    /// Unix millis of last modification
    modified: u64,
    /// Folder path relative to the listing root ("" for the root itself)
    subdir: String,
}

fn note_meta(entry: &fs::DirEntry, root: &PathBuf) -> Option<NoteMeta> {
    let path = entry.path();
    let ext = path.extension()?.to_str()?.to_lowercase();
    if !path.is_file() || !TXT_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    let modified = entry
        .metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let subdir = path
        .parent()
        .and_then(|p| p.strip_prefix(root).ok())
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    Some(NoteMeta {
        name: path.file_name()?.to_str()?.to_string(),
        path: path.to_string_lossy().into_owned(),
        modified,
        subdir,
    })
}

/// Reveal the notes library in Explorer.
#[tauri::command]
fn open_notes_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = notes_dir(&app)?;
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Could not open notes folder: {e}"))?;
    Ok(())
}

/// List text/markdown files in the notes library, newest first.
#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let dir = notes_dir(&app)?;
    let mut notes: Vec<NoteMeta> = fs::read_dir(&dir)
        .map_err(|e| format!("Could not read notes folder: {e}"))?
        .flatten()
        .filter_map(|entry| note_meta(&entry, &dir))
        .collect();
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
}

#[derive(serde::Serialize)]
struct FolderListing {
    notes: Vec<NoteMeta>,
    /// Relative paths of every subdirectory found ("2023/august"), including
    /// empty ones — the sidebar tree shows folders even with nothing in them.
    dirs: Vec<String>,
}

/// Recursively list notes in an arbitrary folder (e.g. an Obsidian vault).
/// Dot-directories (.obsidian, .git, .trash) are skipped; capped so huge
/// vaults stay responsive. Files are left exactly as-is on disk, which is
/// what makes swapping between lwriter and Obsidian seamless.
#[tauri::command]
fn list_folder_notes(path: String) -> Result<FolderListing, String> {
    const MAX_NOTES: usize = 1000;
    const MAX_DEPTH: usize = 8;

    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a folder: {path}"));
    }

    let mut notes = Vec::new();
    let mut dirs = Vec::new();
    let mut stack = vec![(root.clone(), 0usize)];
    'walk: while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = entry.file_name().to_string_lossy().into_owned();
                // Skip dot-dirs and "archive" — archived notes stay on disk
                // but out of the sidebar.
                if depth < MAX_DEPTH
                    && !name.starts_with('.')
                    && !name.eq_ignore_ascii_case("archive")
                {
                    if let Ok(rel) = p.strip_prefix(&root) {
                        dirs.push(rel.to_string_lossy().replace('\\', "/"));
                    }
                    stack.push((p, depth + 1));
                }
                continue;
            }
            if let Some(meta) = note_meta(&entry, &root) {
                notes.push(meta);
                if notes.len() >= MAX_NOTES {
                    break 'walk;
                }
            }
        }
    }
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(FolderListing { notes, dirs })
}

/// Pick a filename in `dir` that doesn't collide: "name.md", "name 2.md", …
fn unique_target(dir: &std::path::Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let stem = std::path::Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| file_name.to_string());
    let ext = std::path::Path::new(file_name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    (2..)
        .map(|i| dir.join(format!("{stem} {i}{ext}")))
        .find(|t| !t.exists())
        .unwrap()
}

fn image_mime(path: &std::path::Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        _ => return None,
    })
}

/// Write pasted image bytes (base64) into `dir` — the folder of the note
/// being edited, the way Obsidian stores attachments. Renames on collision;
/// returns the file name actually used.
#[tauri::command]
fn save_image(dir: String, name: String, data: String) -> Result<String, String> {
    use base64::Engine;
    let dir = PathBuf::from(&dir);
    if !dir.is_dir() {
        return Err(format!("Not a folder: {}", dir.display()));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Bad image data: {e}"))?;
    let target = unique_target(&dir, &name);
    fs::write(&target, bytes).map_err(|e| format!("Could not save image: {e}"))?;
    Ok(target
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned())
}

/// Copy a dropped image file into `dir` (no-op if it already lives there).
/// Returns the file name to embed.
#[tauri::command]
fn import_image(dir: String, src_path: String) -> Result<String, String> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() || image_mime(&src).is_none() {
        return Err(format!("Not an image file: {src_path}"));
    }
    let dir = PathBuf::from(&dir);
    let name = src
        .file_name()
        .ok_or("Invalid path")?
        .to_string_lossy()
        .into_owned();
    // Already next to the note — embed it in place, don't duplicate.
    let same_dir = match (src.parent().and_then(|p| p.canonicalize().ok()), dir.canonicalize()) {
        (Some(a), Ok(b)) => a == b,
        _ => src.parent() == Some(dir.as_path()),
    };
    if same_dir {
        return Ok(name);
    }
    let target = unique_target(&dir, &name);
    fs::copy(&src, &target).map_err(|e| format!("Could not copy image: {e}"))?;
    Ok(target
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned())
}

/// Read an image file as a data: URI so the preview can show it without
/// widening the asset CSP (img-src already allows data:).
#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    use base64::Engine;
    const MAX_BYTES: u64 = 32 * 1024 * 1024;
    let p = PathBuf::from(&path);
    let mime = image_mime(&p).ok_or_else(|| format!("Not an image: {path}"))?;
    let size = fs::metadata(&p).map_err(|e| format!("Could not read {path}: {e}"))?.len();
    if size > MAX_BYTES {
        return Err(format!("Image too large to preview: {path}"));
    }
    let bytes = fs::read(&p).map_err(|e| format!("Could not read {path}: {e}"))?;
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{data}"))
}

/// Move a note to the system Recycle Bin (recoverable, so no confirm dialog).
#[tauri::command]
fn delete_note(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Could not delete {path}: {e}"))
}

/// Rename a note in place. Extension is preserved; Windows-invalid characters
/// are stripped. Returns the new full path.
#[tauri::command]
fn rename_note(path: String, new_name: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let dir = src.parent().ok_or("Invalid path")?;
    let clean: String = new_name
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .collect();
    let clean = clean.trim();
    if clean.is_empty() {
        return Err("Name can't be empty".into());
    }
    let ext = src
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let target = dir.join(format!("{clean}{ext}"));
    if target.exists() {
        return Err("A note with that name already exists".into());
    }
    fs::rename(&src, &target).map_err(|e| format!("Could not rename: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

/// Move a note into `dest_dir` (created if missing), renaming on collision.
/// Falls back to copy+delete across drives. Returns the new full path.
#[tauri::command]
fn move_note(path: String, dest_dir: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let file_name = src
        .file_name()
        .ok_or("Invalid path")?
        .to_string_lossy()
        .into_owned();
    let dir = PathBuf::from(&dest_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create folder: {e}"))?;
    let target = unique_target(&dir, &file_name);
    if fs::rename(&src, &target).is_err() {
        fs::copy(&src, &target).map_err(|e| format!("Could not move: {e}"))?;
        fs::remove_file(&src).map_err(|e| format!("Could not move: {e}"))?;
    }
    Ok(target.to_string_lossy().into_owned())
}

/// Reveal a file (selected) or folder in Explorer.
#[tauri::command]
fn show_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let mut cmd = std::process::Command::new("explorer");
    if p.is_file() {
        cmd.arg("/select,").arg(&p);
    } else {
        cmd.arg(&p);
    }
    cmd.spawn().map_err(|e| format!("Could not open Explorer: {e}"))?;
    Ok(())
}

/// The notes library path, for the frontend (move targets, etc.).
#[tauri::command]
fn get_notes_dir(app: tauri::AppHandle) -> Result<String, String> {
    notes_dir(&app).map(|d| d.to_string_lossy().into_owned())
}

/// Native "save as HTML" dialog for the export feature.
#[tauri::command]
async fn save_html_dialog(default_name: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .add_filter("HTML", &["html", "htm"])
            .set_file_name(&default_name)
            .save_file()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

const FONT_EXTENSIONS: &[&str] = &["ttf", "otf", "woff", "woff2", "ttc", "otc"];

/// Read a font file and return name + base64 bytes for the FontFace API.
fn font_payload(path: &std::path::Path) -> Option<serde_json::Value> {
    use base64::Engine;
    let bytes = fs::read(path).ok()?;
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let name = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Custom".to_string());
    Some(serde_json::json!({ "name": name, "data": data }))
}

/// Let the user pick a font file; returns its display name + base64 bytes so
/// the frontend can register it via the FontFace API (avoids CSP font-src).
#[tauri::command]
async fn pick_font() -> Option<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = rfd::FileDialog::new()
            .add_filter("Fonts", FONT_EXTENSIONS)
            .add_filter("All files", &["*"])
            .pick_file()?;
        font_payload(&path)
    })
    .await
    .ok()
    .flatten()
}

/// Load one specific font file (used by the installed-fonts dropdown).
#[tauri::command]
fn read_font_file(path: String) -> Option<serde_json::Value> {
    let p = PathBuf::from(&path);
    let ext = p.extension()?.to_str()?.to_lowercase();
    if !FONT_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    font_payload(&p)
}

/// Enumerate installed fonts from the registry. The C:\Windows\Fonts folder
/// is a virtual shell view that file dialogs can't browse properly (files
/// show as font "objects" that never match extension filters — the bug that
/// made picking a system font impossible on Windows 10), so the app offers
/// a real list instead. Covers machine-wide and per-user installed fonts.
#[tauri::command]
fn list_system_fonts() -> Vec<serde_json::Value> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        const KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
        let sys_fonts = std::env::var("WINDIR")
            .map(|w| PathBuf::from(w).join("Fonts"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\Windows\Fonts"));

        let mut fonts: Vec<(String, PathBuf)> = Vec::new();
        for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
            let Ok(key) = RegKey::predef(hive).open_subkey(KEY) else {
                continue;
            };
            for (display, value) in key.enum_values().flatten() {
                let file = format!("{value}");
                // HKLM values are usually bare filenames relative to
                // Windows\Fonts; per-user (HKCU) values are absolute.
                let p = if file.contains(':') || file.contains('\\') {
                    PathBuf::from(&file)
                } else {
                    sys_fonts.join(&file)
                };
                let ext = p
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !matches!(ext.as_str(), "ttf" | "otf" | "ttc" | "otc") || !p.is_file() {
                    continue;
                }
                // "Georgia (TrueType)" → "Georgia"
                let mut name = display.clone();
                if display.ends_with(')') {
                    if let Some(i) = display.rfind(" (") {
                        name = display[..i].to_string();
                    }
                }
                fonts.push((name, p));
            }
        }
        fonts.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
        fonts.dedup_by(|a, b| a.0.eq_ignore_ascii_case(&b.0));
        return fonts
            .into_iter()
            .map(|(name, p)| serde_json::json!({ "name": name, "path": p.to_string_lossy() }))
            .collect();
    }
    #[cfg(not(windows))]
    Vec::new()
}

/// Show a native folder picker. Returns the chosen folder, or None if cancelled.
#[tauri::command]
async fn open_folder_dialog() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .pick_folder()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

fn file_filters(dialog: rfd::FileDialog) -> rfd::FileDialog {
    dialog
        .add_filter("Text & Markdown", TXT_EXTENSIONS)
        .add_filter("All files", &["*"])
}

/// Show a native "open file" dialog. Returns the chosen path, or None if cancelled.
#[tauri::command]
async fn open_file_dialog() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        file_filters(rfd::FileDialog::new())
            .pick_file()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

/// Show a native "save file" dialog. New documents default into the notes
/// library; existing documents default to their own folder.
#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    default_name: String,
    current_path: Option<String>,
    start_dir: Option<String>,
) -> Option<String> {
    // Precedence: the open file's own folder, then an explicit start folder
    // (Ctrl+N inside a vault folder), then the notes library.
    let start_dir = current_path
        .and_then(|p| PathBuf::from(p).parent().map(|d| d.to_path_buf()))
        .or_else(|| start_dir.map(PathBuf::from).filter(|d| d.is_dir()))
        .or_else(|| notes_dir(&app).ok());
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = file_filters(rfd::FileDialog::new()).set_file_name(&default_name);
        if let Some(dir) = start_dir {
            dialog = dialog.set_directory(dir);
        }
        dialog
            .save_file()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

/// Ask what to do with unsaved changes: "save" | "discard" | "cancel".
/// Uses YesNoCancel (native MessageBox) — Yes=save, No=close without saving.
#[tauri::command]
async fn confirm_save(file_name: String) -> String {
    tauri::async_runtime::spawn_blocking(move || {
        let result = rfd::MessageDialog::new()
            .set_title("Unsaved changes")
            .set_description(format!(
                "Do you want to save changes to \u{201c}{file_name}\u{201d}?"
            ))
            .set_level(rfd::MessageLevel::Warning)
            .set_buttons(rfd::MessageButtons::YesNoCancel)
            .show();
        match result {
            rfd::MessageDialogResult::Yes => "save",
            rfd::MessageDialogResult::No => "discard",
            _ => "cancel",
        }
        .to_string()
    })
    .await
    .unwrap_or_else(|_| "cancel".to_string())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("Could not open {path}: {e}"))
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents).map_err(|e| format!("Could not save {path}: {e}"))
}

// ---- Window control commands ----

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
fn is_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            open_folder_dialog,
            save_html_dialog,
            pick_font,
            read_font_file,
            list_system_fonts,
            list_notes,
            list_folder_notes,
            open_notes_dir,
            get_notes_dir,
            delete_note,
            rename_note,
            move_note,
            show_in_explorer,
            confirm_save,
            read_file,
            write_file,
            save_image,
            import_image,
            read_image,
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_maximized,
            start_dragging
        ])
        .run(tauri::generate_context!())
        .expect("error while running lwriter");
}
