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
- link an Obsidian vault (folder icon in the sidebar header) to edit it in place
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

/// Recursively list notes in an arbitrary folder (e.g. an Obsidian vault).
/// Dot-directories (.obsidian, .git, .trash) are skipped; capped so huge
/// vaults stay responsive. Files are left exactly as-is on disk, which is
/// what makes swapping between lwriter and Obsidian seamless.
#[tauri::command]
fn list_folder_notes(path: String) -> Result<Vec<NoteMeta>, String> {
    const MAX_NOTES: usize = 1000;
    const MAX_DEPTH: usize = 8;

    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a folder: {path}"));
    }

    let mut notes = Vec::new();
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
    Ok(notes)
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

/// Let the user pick a font file; returns its display name + base64 bytes so
/// the frontend can register it via the FontFace API (avoids CSP font-src).
#[tauri::command]
async fn pick_font() -> Option<serde_json::Value> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(|| {
        let path = rfd::FileDialog::new()
            .add_filter("Fonts", &["ttf", "otf", "woff", "woff2"])
            .pick_file()?;
        let bytes = fs::read(&path).ok()?;
        let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let name = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Custom".to_string());
        Some(serde_json::json!({ "name": name, "data": data }))
    })
    .await
    .ok()
    .flatten()
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
) -> Option<String> {
    let start_dir = current_path
        .and_then(|p| PathBuf::from(p).parent().map(|d| d.to_path_buf()))
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
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_maximized,
            start_dragging
        ])
        .run(tauri::generate_context!())
        .expect("error while running lwriter");
}
