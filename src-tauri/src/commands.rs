use std::path::Path;
use std::process::Command;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;
use walkdir::WalkDir;

use crate::models::{Directory, NoteRecord, Textbook};

pub struct DbState(pub Mutex<Connection>);

fn sanitize_slug(name: &str) -> String {
    name.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "-")
        .trim_matches('-')
        .to_string()
}

fn title_from_stem(stem: &str) -> String {
    stem.replace(|c: char| c == '-' || c == '_', " ")
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().to_string() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn row_to_directory(row: &rusqlite::Row) -> rusqlite::Result<Directory> {
    Ok(Directory {
        id: row.get(0)?,
        path: row.get(1)?,
        label: row.get(2)?,
        added_at: row.get(3)?,
    })
}

fn row_to_note(row: &rusqlite::Row) -> rusqlite::Result<NoteRecord> {
    Ok(NoteRecord {
        id: row.get(0)?,
        slug: row.get(1)?,
        page: row.get(2)?,
        content: row.get(3)?,
        format: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn query_all_directories(conn: &Connection) -> Result<Vec<Directory>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, label, added_at FROM directories ORDER BY added_at")
        .map_err(|e| e.to_string())?;
    let dirs = stmt
        .query_map([], row_to_directory)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(dirs)
}

#[tauri::command]
pub fn list_directories(state: State<'_, DbState>) -> Result<Vec<Directory>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    query_all_directories(&conn)
}

#[tauri::command]
pub fn add_directory(path: String, state: State<'_, DbState>) -> Result<Directory, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let label = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO directories (path, label) VALUES (?1, ?2)",
        rusqlite::params![path, label],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT id, path, label, added_at FROM directories WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let dir = stmt
        .query_row([id], row_to_directory)
        .map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn remove_directory(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM directories WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_textbooks(state: State<'_, DbState>) -> Result<Vec<Textbook>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let dirs = query_all_directories(&conn)?;

    let mut textbooks = Vec::new();
    for dir in &dirs {
        let dir_path = Path::new(&dir.path);
        if !dir_path.is_dir() {
            continue;
        }
        for entry in WalkDir::new(dir_path).max_depth(1).into_iter().flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .map(|e| e.to_ascii_lowercase() == "pdf")
                    .unwrap_or(false)
            {
                let file_name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let stem = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let slug = format!("{}_{}", dir.id, sanitize_slug(&stem));
                let title = title_from_stem(&stem);
                let full_path = path.to_string_lossy().to_string();
                textbooks.push(Textbook {
                    slug,
                    title,
                    file: file_name,
                    dir_id: dir.id,
                    dir_path: dir.path.clone(),
                    full_path,
                });
            }
        }
    }
    Ok(textbooks)
}

#[tauri::command]
pub fn rename_textbook(full_path: String, new_name: String) -> Result<(), String> {
    let path = Path::new(&full_path);
    if !path.is_file() {
        return Err(format!("File not found: {}", full_path));
    }
    let parent = path.parent().ok_or("No parent directory")?;
    let new_file = if new_name.to_lowercase().ends_with(".pdf") {
        new_name
    } else {
        format!("{}.pdf", new_name)
    };
    let new_path = parent.join(&new_file);
    std::fs::rename(path, &new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_textbook(full_path: String) -> Result<(), String> {
    let path = Path::new(&full_path);
    if !path.is_file() {
        return Err(format!("File not found: {}", full_path));
    }
    std::fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn detect_os_theme() -> String {
    // Try freedesktop portal (works on Ubuntu/GNOME/KDE)
    // color-scheme: 0=no-preference, 1=prefer-dark, 2=prefer-light
    if let Ok(output) = Command::new("dbus-send")
        .args([
            "--session",
            "--dest=org.freedesktop.portal.Desktop",
            "--print-reply",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Settings.Read",
            "string:org.freedesktop.appearance",
            "string:color-scheme",
        ])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // The reply contains "uint32 N" where N is the scheme value
        if stdout.contains("uint32 1") {
            return "dark".into();
        }
        if stdout.contains("uint32 2") || stdout.contains("uint32 0") {
            return "light".into();
        }
    }

    // Fallback: gsettings color-scheme
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("prefer-dark") {
            return "dark".into();
        }
    }

    // Fallback: check GTK theme name for "dark" substring
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
        if stdout.contains("dark") {
            return "dark".into();
        }
    }

    "dark".into()
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn get_note(slug: String, page: i64, state: State<'_, DbState>) -> Result<Option<NoteRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, slug, page, content, format, updated_at FROM notes WHERE slug = ?1 AND page = ?2")
        .map_err(|e| e.to_string())?;
    let result = stmt.query_row(rusqlite::params![slug, page], row_to_note);
    match result {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_note(slug: String, page: i64, content: String, format: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if content.is_empty() {
        conn.execute(
            "DELETE FROM notes WHERE slug = ?1 AND page = ?2",
            rusqlite::params![slug, page],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO notes (slug, page, content, format, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(slug, page) DO UPDATE SET content = ?3, format = ?4, updated_at = datetime('now')",
            rusqlite::params![slug, page, content, format],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_notes_for_book(slug: String, state: State<'_, DbState>) -> Result<Vec<NoteRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, slug, page, content, format, updated_at FROM notes WHERE slug = ?1 ORDER BY page")
        .map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map(rusqlite::params![slug], row_to_note)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(notes)
}

#[tauri::command]
pub fn delete_note(slug: String, page: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM notes WHERE slug = ?1 AND page = ?2",
        rusqlite::params![slug, page],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_note_image(slug: String, page: i64, filename: String, data: Vec<u8>, state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO note_images (note_slug, note_page, filename, data)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(note_slug, note_page, filename) DO UPDATE SET data = ?4",
        rusqlite::params![slug, page, filename, data],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn get_note_image(id: i64, state: State<'_, DbState>) -> Result<tauri::ipc::Response, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let data: Vec<u8> = conn
        .query_row(
            "SELECT data FROM note_images WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(data))
}

#[tauri::command]
pub fn export_notes_for_book(slug: String, state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT page, content FROM notes WHERE slug = ?1 ORDER BY page")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(rusqlite::params![slug], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut output = String::new();
    for (page, content) in rows {
        output.push_str(&format!("## Page {}\n\n{}\n\n", page, content));
    }
    Ok(output)
}

#[tauri::command]
pub fn migrate_notes_from_json(json_data: String, state: State<'_, DbState>) -> Result<i64, String> {
    let map: std::collections::HashMap<String, String> =
        serde_json::from_str(&json_data).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut count: i64 = 0;
    for (key, content) in &map {
        let parts: Vec<&str> = key.rsplitn(2, ':').collect();
        if parts.len() != 2 {
            continue;
        }
        let page: i64 = match parts[0].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let slug = parts[1];
        let is_empty = content.is_empty() || content == "<p></p>";
        if is_empty {
            continue;
        }
        conn.execute(
            "INSERT INTO notes (slug, page, content, format, updated_at)
             VALUES (?1, ?2, ?3, 'html', datetime('now'))
             ON CONFLICT(slug, page) DO UPDATE SET content = ?3, updated_at = datetime('now')",
            rusqlite::params![slug, page, content],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}
