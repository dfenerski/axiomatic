use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;
use walkdir::WalkDir;

use crate::models::{BookProgress, BookTagMapping, Directory, NoteRecord, OrphanCandidate, Tag, Textbook};

pub struct DbState(pub Mutex<Connection>);
pub struct PendingFile(pub Mutex<Option<String>>);

/// Lock the database connection, converting poison errors to String.
pub fn get_db<'a>(state: &'a State<'a, DbState>) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.0.lock().map_err(|e| e.to_string())
}

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

pub fn list_directories_inner(conn: &Connection) -> Result<Vec<Directory>, String> {
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
    let conn = get_db(&state)?;
    list_directories_inner(&conn)
}

/// Insert a directory into SQLite and return it. Does NOT check if the path
/// is a real directory on disk (caller must verify). Does NOT create
/// .axiomatic/ (caller must call ensure_axiomatic_dir separately).
pub fn add_directory_inner(conn: &Connection, path: &str, label: &str) -> Result<Directory, String> {
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
pub fn add_directory(path: String, state: State<'_, DbState>) -> Result<Directory, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let label = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let conn = get_db(&state)?;
    let dir = add_directory_inner(&conn, &path, &label)?;

    // Auto-create .axiomatic/ project state directory
    ensure_axiomatic_dir(&path)?;

    Ok(dir)
}

pub fn remove_directory_inner(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM directories WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_directory(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    remove_directory_inner(&conn, id)
}

/// Scan directories for PDF files and return textbook metadata.
fn scan_textbooks(dirs: &[Directory]) -> Vec<Textbook> {
    let mut textbooks = Vec::new();
    for dir in dirs {
        let dir_path = Path::new(&dir.path);
        if !dir_path.is_dir() {
            continue;
        }
        for entry in WalkDir::new(dir_path)
            .into_iter()
            .filter_entry(|e| e.file_name().to_str().map(|s| s != ".axiomatic").unwrap_or(true))
            .flatten()
        {
            let path = entry.path();
            if path.is_file()
                && path.extension().map(|e| e.to_ascii_lowercase() == "pdf").unwrap_or(false)
            {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                textbooks.push(Textbook {
                    slug: format!("{}_{}", dir.id, sanitize_slug(&stem)),
                    title: title_from_stem(&stem),
                    file: file_name,
                    dir_id: dir.id,
                    dir_path: dir.path.clone(),
                    full_path: path.to_string_lossy().to_string(),
                });
            }
        }
    }
    textbooks
}

#[tauri::command]
pub async fn list_textbooks(state: State<'_, DbState>) -> Result<Vec<Textbook>, String> {
    let dirs = {
        let conn = get_db(&state)?;
        list_directories_inner(&conn)?
    };
    tauri::async_runtime::spawn_blocking(move || Ok(scan_textbooks(&dirs)))
        .await
        .map_err(|e| e.to_string())?
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

pub fn get_note_inner(conn: &Connection, slug: &str, page: i64) -> Result<Option<NoteRecord>, String> {
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
pub fn get_note(slug: String, page: i64, state: State<'_, DbState>) -> Result<Option<NoteRecord>, String> {
    let conn = get_db(&state)?;
    get_note_inner(&conn, &slug, page)
}

pub fn set_note_inner(conn: &Connection, slug: &str, page: i64, content: &str, format: &str) -> Result<(), String> {
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
pub fn set_note(slug: String, page: i64, content: String, format: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    set_note_inner(&conn, &slug, page, &content, &format)
}

pub fn list_notes_for_book_inner(conn: &Connection, slug: &str) -> Result<Vec<NoteRecord>, String> {
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
pub fn list_notes_for_book(slug: String, state: State<'_, DbState>) -> Result<Vec<NoteRecord>, String> {
    let conn = get_db(&state)?;
    list_notes_for_book_inner(&conn, &slug)
}

pub fn delete_note_inner(conn: &Connection, slug: &str, page: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM notes WHERE slug = ?1 AND page = ?2",
        rusqlite::params![slug, page],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(slug: String, page: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    delete_note_inner(&conn, &slug, page)
}

pub fn save_note_image_inner(conn: &Connection, slug: &str, page: i64, filename: &str, data: &[u8]) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO note_images (note_slug, note_page, filename, data)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(note_slug, note_page, filename) DO UPDATE SET data = ?4",
        rusqlite::params![slug, page, filename, data],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn save_note_image(slug: String, page: i64, filename: String, data: Vec<u8>, state: State<'_, DbState>) -> Result<i64, String> {
    let conn = get_db(&state)?;
    save_note_image_inner(&conn, &slug, page, &filename, &data)
}

pub fn get_note_image_inner(conn: &Connection, id: i64) -> Result<Vec<u8>, String> {
    let data: Vec<u8> = conn
        .query_row(
            "SELECT data FROM note_images WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub fn get_note_image(id: i64, state: State<'_, DbState>) -> Result<tauri::ipc::Response, String> {
    let conn = get_db(&state)?;
    let data = get_note_image_inner(&conn, id)?;
    Ok(tauri::ipc::Response::new(data))
}

#[tauri::command]
pub fn export_notes_for_book(slug: String, state: State<'_, DbState>) -> Result<String, String> {
    let conn = get_db(&state)?;
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
    let conn = get_db(&state)?;
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

pub fn list_tags_inner(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY id")
        .map_err(|e| e.to_string())?;
    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(tags)
}

#[tauri::command]
pub fn list_tags(state: State<'_, DbState>) -> Result<Vec<Tag>, String> {
    let conn = get_db(&state)?;
    list_tags_inner(&conn)
}

pub fn create_tag_inner(conn: &Connection, name: &str, color: &str) -> Result<Tag, String> {
    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        rusqlite::params![name, color],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Tag { id, name: name.to_string(), color: color.to_string() })
}

#[tauri::command]
pub fn create_tag(name: String, color: String, state: State<'_, DbState>) -> Result<Tag, String> {
    let conn = get_db(&state)?;
    create_tag_inner(&conn, &name, &color)
}

pub fn delete_tag_inner(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_tag(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    delete_tag_inner(&conn, id)
}

pub fn update_tag_color_inner(conn: &Connection, id: i64, color: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE tags SET color = ?1 WHERE id = ?2",
        rusqlite::params![color, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_tag_color(id: i64, color: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    update_tag_color_inner(&conn, id, &color)
}

pub fn tag_book_inner(conn: &Connection, book_slug: &str, tag_id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO book_tags (book_slug, tag_id) VALUES (?1, ?2)",
        rusqlite::params![book_slug, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn tag_book(book_slug: String, tag_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    tag_book_inner(&conn, &book_slug, tag_id)
}

pub fn untag_book_inner(conn: &Connection, book_slug: &str, tag_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM book_tags WHERE book_slug = ?1 AND tag_id = ?2",
        rusqlite::params![book_slug, tag_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn untag_book(book_slug: String, tag_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_db(&state)?;
    untag_book_inner(&conn, &book_slug, tag_id)
}

pub fn list_book_tags_all_inner(conn: &Connection) -> Result<Vec<BookTagMapping>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT bt.book_slug, t.id, t.name, t.color
             FROM book_tags bt
             JOIN tags t ON t.id = bt.tag_id
             ORDER BY bt.book_slug, t.id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, i64, String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(BookTagMapping::group_from_rows(rows))
}

#[tauri::command]
pub fn list_book_tags_all(state: State<'_, DbState>) -> Result<Vec<BookTagMapping>, String> {
    let conn = get_db(&state)?;
    list_book_tags_all_inner(&conn)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {:?}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn open_file(file_path: String, state: State<'_, DbState>) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.is_file() {
        return Err(format!("File not found: {}", file_path));
    }
    if path
        .extension()
        .map(|e| e.to_ascii_lowercase() != "pdf")
        .unwrap_or(true)
    {
        return Err(format!("Not a PDF file: {}", file_path));
    }

    let parent = path
        .parent()
        .ok_or("No parent directory")?
        .to_string_lossy()
        .to_string();
    let conn = get_db(&state)?;

    // Find or insert directory
    let dir_id: i64 = match conn.query_row(
        "SELECT id FROM directories WHERE path = ?1",
        rusqlite::params![parent],
        |row| row.get(0),
    ) {
        Ok(id) => id,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let label = Path::new(&parent)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| parent.clone());
            conn.execute(
                "INSERT INTO directories (path, label) VALUES (?1, ?2)",
                rusqlite::params![parent, label],
            )
            .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
        Err(e) => return Err(e.to_string()),
    };

    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let slug = format!("{}_{}", dir_id, sanitize_slug(&stem));
    Ok(slug)
}

#[tauri::command]
pub fn import_pdf_register(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    use tauri::Manager;

    // Ensure <app_data>/library/ exists and is tracked as a directory
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let library_dir = app_data.join("library");
    std::fs::create_dir_all(&library_dir).map_err(|e| {
        format!("Failed to create library directory: {}", e)
    })?;

    let lib_path_str = library_dir.to_string_lossy().to_string();
    let conn = get_db(&state)?;

    // Insert directory if not already tracked
    match conn.query_row(
        "SELECT id FROM directories WHERE path = ?1",
        rusqlite::params![lib_path_str],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(_) => {}
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO directories (path, label) VALUES (?1, ?2)",
                rusqlite::params![lib_path_str, "Library"],
            )
            .map_err(|e| e.to_string())?;
            let _ = ensure_axiomatic_dir(&lib_path_str);
        }
        Err(e) => return Err(e.to_string()),
    };

    Ok(lib_path_str)
}

#[tauri::command]
pub fn get_pending_file(state: State<'_, PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut f| f.take())
}

/// Creates the `.axiomatic/` project state directory inside the given library
/// directory if it does not already exist, and returns its path.
pub fn ensure_axiomatic_dir(dir_path: &str) -> Result<PathBuf, String> {
    let axiomatic_dir = Path::new(dir_path).join(".axiomatic");
    std::fs::create_dir_all(&axiomatic_dir).map_err(|e| {
        format!(
            "Failed to create .axiomatic directory in {}: {}",
            dir_path, e
        )
    })?;
    Ok(axiomatic_dir)
}

// ---------- task-003: progress commands ----------

#[tauri::command]
pub fn get_all_progress(dir_path: String) -> Result<HashMap<String, BookProgress>, String> {
    Ok(crate::json_storage::read_json(&dir_path, "progress.json"))
}

#[tauri::command]
pub fn save_progress(dir_path: String, slug: String, progress: BookProgress) -> Result<(), String> {
    let mut map: HashMap<String, BookProgress> = crate::json_storage::read_json(&dir_path, "progress.json");
    map.insert(slug, progress);
    crate::json_storage::write_json(&dir_path, "progress.json", &map)
}

// ---------- task-004: starred commands ----------

#[tauri::command]
pub fn get_starred(dir_path: String) -> Result<Vec<String>, String> {
    let map: HashMap<String, bool> = crate::json_storage::read_json(&dir_path, "starred.json");
    Ok(map.into_keys().collect())
}

#[tauri::command]
pub fn toggle_starred(dir_path: String, slug: String) -> Result<bool, String> {
    let mut map: HashMap<String, bool> = crate::json_storage::read_json(&dir_path, "starred.json");
    let new_state = if map.contains_key(&slug) {
        map.remove(&slug);
        false
    } else {
        map.insert(slug, true);
        true
    };
    crate::json_storage::write_json(&dir_path, "starred.json", &map)?;
    Ok(new_state)
}

// ---------- task-006: xp commands ----------

#[tauri::command]
pub fn get_xp(dir_path: String, slug: String) -> Result<i64, String> {
    let map: HashMap<String, i64> = crate::json_storage::read_json(&dir_path, "xp.json");
    Ok(map.get(&slug).copied().unwrap_or(0))
}

#[tauri::command]
pub fn increment_xp(dir_path: String, slug: String) -> Result<i64, String> {
    let mut map: HashMap<String, i64> = crate::json_storage::read_json(&dir_path, "xp.json");
    let entry = map.entry(slug).or_insert(0);
    *entry += 1;
    let new_value = *entry;
    crate::json_storage::write_json(&dir_path, "xp.json", &map)?;
    Ok(new_value)
}

// ---------- task-007: slug migration commands ----------

/// Collect all distinct slugs referenced in SQLite tables.
fn collect_db_slugs(conn: &Connection) -> Result<HashMap<String, Vec<String>>, String> {
    let mut evidence: HashMap<String, Vec<String>> = HashMap::new();
    let tables = [
        ("SELECT DISTINCT slug FROM highlights", "highlights"),
        ("SELECT DISTINCT slug FROM notes", "notes"),
        ("SELECT DISTINCT note_slug FROM note_images", "note_images"),
        ("SELECT DISTINCT book_slug FROM book_tags", "book_tags"),
    ];
    for (sql, table) in tables {
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        for slug in stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .flatten()
        {
            evidence.entry(slug).or_default().push(table.into());
        }
    }
    Ok(evidence)
}

/// Simple similarity score between two strings based on common character bigrams.
/// Returns a value between 0.0 and 1.0.
fn bigram_similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() || a.len() < 2 || b.len() < 2 {
        return 0.0;
    }
    let a_bigrams: HashSet<(char, char)> = a.chars().zip(a.chars().skip(1)).collect();
    let b_bigrams: HashSet<(char, char)> = b.chars().zip(b.chars().skip(1)).collect();
    let intersection = a_bigrams.intersection(&b_bigrams).count();
    let union = a_bigrams.union(&b_bigrams).count();
    if union == 0 {
        return 0.0;
    }
    intersection as f64 / union as f64
}

#[tauri::command]
pub async fn detect_orphaned_slugs(
    state: State<'_, DbState>,
) -> Result<Vec<OrphanCandidate>, String> {
    // 1. Gather all data slugs from SQLite
    let (slug_evidence, dirs) = {
        let conn = get_db(&state)?;
        let evidence = collect_db_slugs(&conn)?;
        let dirs = list_directories_inner(&conn)?;
        (evidence, dirs)
    };

    // 2. Discover all current textbook slugs by scanning directories
    let dirs_clone = dirs.clone();
    let textbooks: Vec<Textbook> = tauri::async_runtime::spawn_blocking(move || {
        scan_textbooks(&dirs_clone)
    })
    .await
    .map_err(|e| e.to_string())?;

    let current_slugs: HashSet<String> = textbooks.iter().map(|t| t.slug.clone()).collect();

    // Build a map of dir_id prefix -> list of current textbooks (for candidate matching)
    let mut slugs_by_dir_id: HashMap<String, Vec<&Textbook>> = HashMap::new();
    for tb in &textbooks {
        let prefix = format!("{}_", tb.dir_id);
        slugs_by_dir_id.entry(prefix).or_default().push(tb);
    }

    // Build dir_id -> dir_path map
    let dir_path_map: HashMap<i64, String> = dirs.iter().map(|d| (d.id, d.path.clone())).collect();

    // 3. Find orphaned slugs (referenced in data but not in current textbooks)
    let mut candidates = Vec::new();
    for (slug, evidence) in &slug_evidence {
        if current_slugs.contains(slug) {
            continue;
        }

        // Extract dir_id prefix from the slug (format: {dir_id}_{sanitized_stem})
        let dir_id_prefix = if let Some(idx) = slug.find('_') {
            &slug[..=idx] // includes the underscore
        } else {
            continue; // malformed slug
        };

        let old_stem = &slug[dir_id_prefix.len()..];
        let dir_id: i64 = match dir_id_prefix.trim_end_matches('_').parse() {
            Ok(id) => id,
            Err(_) => continue,
        };
        let dir_path = dir_path_map.get(&dir_id).cloned().unwrap_or_default();

        // Find the best matching current slug in the same directory
        if let Some(candidates_in_dir) = slugs_by_dir_id.get(dir_id_prefix) {
            let mut best_match: Option<(&Textbook, f64)> = None;

            for tb in candidates_in_dir {
                let new_stem = &tb.slug[dir_id_prefix.len()..];
                let sim = bigram_similarity(old_stem, new_stem);
                if sim > 0.2 {
                    if let Some((_, best_sim)) = &best_match {
                        if sim > *best_sim {
                            best_match = Some((tb, sim));
                        }
                    } else {
                        best_match = Some((tb, sim));
                    }
                }
            }

            if let Some((tb, _)) = best_match {
                candidates.push(OrphanCandidate {
                    old_slug: slug.clone(),
                    new_slug_candidate: tb.slug.clone(),
                    dir_path,
                    evidence: evidence.clone(),
                });
            }
        }
    }

    Ok(candidates)
}

/// Migrate slug references in SQLite tables and .axiomatic/ JSON files.
/// The SQLite updates are wrapped in a transaction for atomicity.
pub fn migrate_slug_inner(
    conn: &Connection,
    old_slug: &str,
    new_slug: &str,
    dir_path: &str,
) -> Result<(), String> {
    // 1. SQLite transaction: update all tables atomically
    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        for sql in [
            "UPDATE highlights SET slug = ?1 WHERE slug = ?2",
            "UPDATE notes SET slug = ?1 WHERE slug = ?2",
            "UPDATE note_images SET note_slug = ?1 WHERE note_slug = ?2",
            "UPDATE book_tags SET book_slug = ?1 WHERE book_slug = ?2",
        ] {
            conn.execute(sql, rusqlite::params![new_slug, old_slug])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK").ok();
            return Err(e);
        }
    }

    // 2. Update .axiomatic/ JSON files in the directory
    let axiomatic_dir = Path::new(dir_path).join(".axiomatic");
    if axiomatic_dir.is_dir() {
        // Helper: rename a key in a JSON map file
        let rename_key = |filename: &str| {
            let path = axiomatic_dir.join(filename);
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(mut map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&data) {
                    if let Some(val) = map.remove(old_slug) {
                        map.insert(new_slug.to_string(), val);
                        if let Ok(json) = serde_json::to_string_pretty(&map) {
                            std::fs::write(&path, json).ok();
                        }
                    }
                }
            }
        };

        rename_key("progress.json");
        rename_key("starred.json");
        rename_key("xp.json");
        rename_key("pomodoro-xp.json");

        // snips.json — update slug field in array items
        let snips_path = axiomatic_dir.join("snips.json");
        if let Ok(data) = std::fs::read_to_string(&snips_path) {
            if let Ok(mut arr) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                for item in arr.iter_mut().filter_map(|v| v.as_object_mut()) {
                    if item.get("slug").and_then(|v| v.as_str()) == Some(old_slug) {
                        item.insert("slug".into(), serde_json::Value::String(new_slug.to_string()));
                    }
                }
                if let Ok(json) = serde_json::to_string_pretty(&arr) {
                    std::fs::write(&snips_path, json).ok();
                }
            }
        }

        // sessions.json — update slug in nested book entries
        let sessions_path = axiomatic_dir.join("sessions.json");
        if let Ok(data) = std::fs::read_to_string(&sessions_path) {
            if let Ok(mut arr) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                for session in &mut arr {
                    if let Some(books) = session.get_mut("books").and_then(|b| b.as_array_mut()) {
                        for book in books.iter_mut().filter_map(|v| v.as_object_mut()) {
                            if book.get("slug").and_then(|v| v.as_str()) == Some(old_slug) {
                                book.insert("slug".into(), serde_json::Value::String(new_slug.to_string()));
                            }
                        }
                    }
                }
                if let Ok(json) = serde_json::to_string_pretty(&arr) {
                    std::fs::write(&sessions_path, json).ok();
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn migrate_slug(
    old_slug: String,
    new_slug: String,
    dir_path: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = get_db(&state)?;
    migrate_slug_inner(&conn, &old_slug, &new_slug, &dir_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Helper: create a fully migrated in-memory-like SQLite database in a TempDir.
    fn test_db() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = db::init_db(&db_path).unwrap();
        (dir, conn)
    }

    // ================================================================
    // ac-120: ProjectStateDir operations
    // ================================================================

    #[test]
    fn ensure_axiomatic_dir_creates_directory() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        let result = ensure_axiomatic_dir(&dir_path).unwrap();
        assert!(result.exists());
        assert!(result.is_dir());
        assert_eq!(result.file_name().unwrap(), ".axiomatic");
    }

    #[test]
    fn ensure_axiomatic_dir_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        let first = ensure_axiomatic_dir(&dir_path).unwrap();
        let second = ensure_axiomatic_dir(&dir_path).unwrap();
        assert_eq!(first, second);
        assert!(second.is_dir());
    }

    #[test]
    fn progress_json_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        let progress = BookProgress {
            current_page: 42,
            total_pages: 100,
            last_read_at: "2026-01-01T00:00:00Z".to_string(),
        };

        save_progress(dir_path.clone(), "test-slug".into(), progress.clone()).unwrap();
        let loaded = get_all_progress(dir_path).unwrap();

        assert_eq!(loaded.len(), 1);
        let p = loaded.get("test-slug").unwrap();
        assert_eq!(p.current_page, 42);
        assert_eq!(p.total_pages, 100);
        assert_eq!(p.last_read_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn progress_read_nonexistent_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();
        let loaded = get_all_progress(dir_path).unwrap();
        assert!(loaded.is_empty());
    }

    // ================================================================
    // ac-121: Orphan detection and slug migration
    // ================================================================

    #[test]
    fn bigram_similarity_known_pair() {
        let score = bigram_similarity("foo_bar", "foo_baz");
        assert!(score > 0.0, "Expected positive similarity, got {}", score);
        assert!(score < 1.0, "Expected less than 1.0, got {}", score);
    }

    #[test]
    fn bigram_similarity_identical() {
        let score = bigram_similarity("hello", "hello");
        assert!((score - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn bigram_similarity_empty() {
        assert_eq!(bigram_similarity("", "hello"), 0.0);
        assert_eq!(bigram_similarity("a", "hello"), 0.0);
    }

    #[test]
    fn collect_db_slugs_finds_references() {
        let (_dir, conn) = test_db();

        // Insert data referencing slugs
        conn.execute(
            "INSERT INTO notes (slug, page, content, format, updated_at) VALUES ('orphan-slug', 1, 'text', 'md', datetime('now'))",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO highlights (slug, page, x, y, width, height, color, text, group_id) VALUES ('orphan-slug', 1, 0.0, 0.0, 1.0, 1.0, 'yellow', '', '')",
            [],
        ).unwrap();

        let slugs = collect_db_slugs(&conn).unwrap();
        assert!(slugs.contains_key("orphan-slug"));
        let evidence = slugs.get("orphan-slug").unwrap();
        assert!(evidence.contains(&"notes".to_string()));
        assert!(evidence.contains(&"highlights".to_string()));
    }

    #[test]
    fn migrate_slug_updates_all_tiers() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // Create .axiomatic/ and populate JSON files
        let axiomatic_dir = ensure_axiomatic_dir(&dir_path).unwrap();

        // progress.json
        std::fs::write(
            axiomatic_dir.join("progress.json"),
            r#"{"old-slug": {"currentPage": 5, "totalPages": 50, "lastReadAt": "2026-01-01T00:00:00Z"}}"#,
        ).unwrap();

        // starred.json
        std::fs::write(
            axiomatic_dir.join("starred.json"),
            r#"{"old-slug": true}"#,
        ).unwrap();

        // snips.json
        std::fs::write(
            axiomatic_dir.join("snips.json"),
            r#"[{"id":"abc","slug":"old-slug","full_path":"/a.pdf","page":1,"label":"test","x":0,"y":0,"width":1,"height":1,"created_at":"2026-01-01T00:00:00Z"}]"#,
        ).unwrap();

        // xp.json
        std::fs::write(
            axiomatic_dir.join("xp.json"),
            r#"{"old-slug": 10}"#,
        ).unwrap();

        // Setup SQLite with data referencing old slug
        let (_db_dir, conn) = test_db();
        conn.execute(
            "INSERT INTO notes (slug, page, content, format, updated_at) VALUES ('old-slug', 1, 'note', 'md', datetime('now'))",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO highlights (slug, page, x, y, width, height, color, text, group_id) VALUES ('old-slug', 2, 0.0, 0.0, 1.0, 1.0, 'yellow', '', 'g1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO note_images (note_slug, note_page, filename, data) VALUES ('old-slug', 1, 'img.png', X'89504E47')",
            [],
        ).unwrap();

        // Create a tag and associate with old slug
        conn.execute("INSERT INTO tags (name, color) VALUES ('math', 'blue')", []).unwrap();
        let tag_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO book_tags (book_slug, tag_id) VALUES ('old-slug', ?1)",
            [tag_id],
        ).unwrap();

        // Run migration
        migrate_slug_inner(&conn, "old-slug", "new-slug", &dir_path).unwrap();

        // Verify SQLite updates
        let note_slug: String = conn
            .query_row("SELECT slug FROM notes WHERE page = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(note_slug, "new-slug");

        let hl_slug: String = conn
            .query_row("SELECT slug FROM highlights WHERE page = 2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hl_slug, "new-slug");

        let img_slug: String = conn
            .query_row("SELECT note_slug FROM note_images WHERE filename = 'img.png'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(img_slug, "new-slug");

        let bt_slug: String = conn
            .query_row("SELECT book_slug FROM book_tags WHERE tag_id = ?1", [tag_id], |r| r.get(0))
            .unwrap();
        assert_eq!(bt_slug, "new-slug");

        // Verify JSON file updates
        let progress_data = std::fs::read_to_string(axiomatic_dir.join("progress.json")).unwrap();
        let progress_map: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&progress_data).unwrap();
        assert!(progress_map.contains_key("new-slug"));
        assert!(!progress_map.contains_key("old-slug"));

        let starred_data = std::fs::read_to_string(axiomatic_dir.join("starred.json")).unwrap();
        let starred_map: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&starred_data).unwrap();
        assert!(starred_map.contains_key("new-slug"));
        assert!(!starred_map.contains_key("old-slug"));

        let snips_data = std::fs::read_to_string(axiomatic_dir.join("snips.json")).unwrap();
        let snips_arr: Vec<serde_json::Value> = serde_json::from_str(&snips_data).unwrap();
        assert_eq!(snips_arr[0]["slug"].as_str().unwrap(), "new-slug");

        let xp_data = std::fs::read_to_string(axiomatic_dir.join("xp.json")).unwrap();
        let xp_map: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&xp_data).unwrap();
        assert!(xp_map.contains_key("new-slug"));
        assert!(!xp_map.contains_key("old-slug"));
    }

    // ================================================================
    // ac-141: Progress, Starred, XP commands
    // ================================================================

    #[test]
    fn save_and_get_progress_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        save_progress(
            dir_path.clone(),
            "book-a".into(),
            BookProgress {
                current_page: 10,
                total_pages: 200,
                last_read_at: "2026-03-01T12:00:00Z".into(),
            },
        ).unwrap();

        save_progress(
            dir_path.clone(),
            "book-b".into(),
            BookProgress {
                current_page: 1,
                total_pages: 50,
                last_read_at: "2026-03-01T12:00:00Z".into(),
            },
        ).unwrap();

        let all = get_all_progress(dir_path).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all["book-a"].current_page, 10);
        assert_eq!(all["book-b"].total_pages, 50);
    }

    #[test]
    fn toggle_starred_add_and_remove() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // First toggle adds
        let added = toggle_starred(dir_path.clone(), "my-book".into()).unwrap();
        assert!(added, "First toggle should return true (added)");

        // Verify it is in the list
        let starred = get_starred(dir_path.clone()).unwrap();
        assert!(starred.contains(&"my-book".to_string()));

        // Second toggle removes
        let removed = toggle_starred(dir_path.clone(), "my-book".into()).unwrap();
        assert!(!removed, "Second toggle should return false (removed)");

        // Verify it is gone
        let starred = get_starred(dir_path).unwrap();
        assert!(!starred.contains(&"my-book".to_string()));
    }

    #[test]
    fn xp_default_and_increment() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // Unknown slug returns 0
        let xp = get_xp(dir_path.clone(), "slug-a".into()).unwrap();
        assert_eq!(xp, 0);

        // First increment returns 1
        let xp = increment_xp(dir_path.clone(), "slug-a".into()).unwrap();
        assert_eq!(xp, 1);

        // Second increment returns 2
        let xp = increment_xp(dir_path.clone(), "slug-a".into()).unwrap();
        assert_eq!(xp, 2);

        // Verify via get_xp
        let xp = get_xp(dir_path, "slug-a".into()).unwrap();
        assert_eq!(xp, 2);
    }

    // ================================================================
    // ac-142: Directory management
    // ================================================================

    #[test]
    fn add_list_remove_directory() {
        let (_dir, conn) = test_db();

        // Add a directory
        let dir = add_directory_inner(&conn, "/tmp/test-books", "test-books").unwrap();
        assert!(dir.id > 0);
        assert_eq!(dir.path, "/tmp/test-books");
        assert_eq!(dir.label, "test-books");

        // List directories includes it
        let dirs = list_directories_inner(&conn).unwrap();
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].id, dir.id);

        // Remove it
        remove_directory_inner(&conn, dir.id).unwrap();

        // List is now empty
        let dirs = list_directories_inner(&conn).unwrap();
        assert!(dirs.is_empty());
    }

    // ================================================================
    // ac-143: Note operations
    // ================================================================

    #[test]
    fn set_get_delete_note() {
        let (_dir, conn) = test_db();

        // Set a note
        set_note_inner(&conn, "book-a", 5, "Hello world", "markdown").unwrap();

        // Get it back
        let note = get_note_inner(&conn, "book-a", 5).unwrap().unwrap();
        assert_eq!(note.slug, "book-a");
        assert_eq!(note.page, 5);
        assert_eq!(note.content, "Hello world");
        assert_eq!(note.format, "markdown");

        // Delete it
        delete_note_inner(&conn, "book-a", 5).unwrap();

        // Verify gone
        let note = get_note_inner(&conn, "book-a", 5).unwrap();
        assert!(note.is_none());
    }

    #[test]
    fn list_notes_for_book_returns_all_pages() {
        let (_dir, conn) = test_db();

        set_note_inner(&conn, "book-a", 1, "Note page 1", "md").unwrap();
        set_note_inner(&conn, "book-a", 3, "Note page 3", "md").unwrap();
        set_note_inner(&conn, "book-b", 1, "Other book", "md").unwrap();

        let notes = list_notes_for_book_inner(&conn, "book-a").unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].page, 1);
        assert_eq!(notes[1].page, 3);
    }

    #[test]
    fn set_note_empty_content_deletes() {
        let (_dir, conn) = test_db();

        set_note_inner(&conn, "book-a", 1, "Content", "md").unwrap();
        assert!(get_note_inner(&conn, "book-a", 1).unwrap().is_some());

        // Setting empty content deletes the note
        set_note_inner(&conn, "book-a", 1, "", "md").unwrap();
        assert!(get_note_inner(&conn, "book-a", 1).unwrap().is_none());
    }

    #[test]
    fn save_and_get_note_image() {
        let (_dir, conn) = test_db();

        let data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG magic bytes
        let id = save_note_image_inner(&conn, "book-a", 1, "test.png", &data).unwrap();
        assert!(id > 0);

        let loaded = get_note_image_inner(&conn, id).unwrap();
        assert_eq!(loaded, data);
    }

    // ================================================================
    // ac-144: Tag operations
    // ================================================================

    #[test]
    fn create_list_update_delete_tag() {
        let (_dir, conn) = test_db();

        // Create tag
        let tag = create_tag_inner(&conn, "algebra", "#ff0000").unwrap();
        assert!(tag.id > 0);
        assert_eq!(tag.name, "algebra");
        assert_eq!(tag.color, "#ff0000");

        // List tags includes it
        let tags = list_tags_inner(&conn).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "algebra");

        // Update color
        update_tag_color_inner(&conn, tag.id, "#00ff00").unwrap();
        let tags = list_tags_inner(&conn).unwrap();
        assert_eq!(tags[0].color, "#00ff00");

        // Delete tag
        delete_tag_inner(&conn, tag.id).unwrap();
        let tags = list_tags_inner(&conn).unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn tag_and_untag_book() {
        let (_dir, conn) = test_db();

        let tag = create_tag_inner(&conn, "math", "blue").unwrap();

        // Tag a book
        tag_book_inner(&conn, "book-a", tag.id).unwrap();

        // Verify via list_book_tags_all
        let mappings = list_book_tags_all_inner(&conn).unwrap();
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].book_slug, "book-a");
        assert_eq!(mappings[0].tags.len(), 1);
        assert_eq!(mappings[0].tags[0].name, "math");

        // Untag the book
        untag_book_inner(&conn, "book-a", tag.id).unwrap();

        // Verify empty
        let mappings = list_book_tags_all_inner(&conn).unwrap();
        assert!(mappings.is_empty());
    }

    #[test]
    fn delete_tag_cascades_to_book_tags() {
        let (_dir, conn) = test_db();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        let tag = create_tag_inner(&conn, "physics", "green").unwrap();
        tag_book_inner(&conn, "book-a", tag.id).unwrap();

        // Delete the tag -- should cascade
        delete_tag_inner(&conn, tag.id).unwrap();

        let mappings = list_book_tags_all_inner(&conn).unwrap();
        assert!(mappings.is_empty());
    }

    // ================================================================
    // ac-146: File operations
    // ================================================================

    #[test]
    fn rename_textbook_changes_filename() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("old-book.pdf");
        std::fs::write(&original, b"fake pdf").unwrap();

        rename_textbook(
            original.to_string_lossy().to_string(),
            "new-book".to_string(),
        ).unwrap();

        let expected = dir.path().join("new-book.pdf");
        assert!(!original.exists(), "Old file should not exist");
        assert!(expected.exists(), "New file should exist");
    }

    #[test]
    fn rename_textbook_preserves_extension() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("book.pdf");
        std::fs::write(&original, b"fake pdf").unwrap();

        // Passing name with .pdf extension
        rename_textbook(
            original.to_string_lossy().to_string(),
            "renamed.pdf".to_string(),
        ).unwrap();

        let expected = dir.path().join("renamed.pdf");
        assert!(expected.exists());
    }

    #[test]
    fn delete_textbook_removes_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("to-delete.pdf");
        std::fs::write(&file, b"fake pdf").unwrap();
        assert!(file.exists());

        delete_textbook(file.to_string_lossy().to_string()).unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn delete_textbook_nonexistent_fails() {
        let result = delete_textbook("/nonexistent/path.pdf".to_string());
        assert!(result.is_err());
    }

    // ================================================================
    // Helper function tests
    // ================================================================

    #[test]
    fn sanitize_slug_works() {
        assert_eq!(sanitize_slug("Hello World"), "hello-world");
        assert_eq!(sanitize_slug("foo_bar"), "foo_bar");
        assert_eq!(sanitize_slug("--test--"), "test");
    }

    #[test]
    fn title_from_stem_works() {
        assert_eq!(title_from_stem("hello-world"), "Hello World");
        assert_eq!(title_from_stem("foo_bar"), "Foo Bar");
    }
}

