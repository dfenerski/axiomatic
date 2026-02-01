use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_db(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS directories (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            path  TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            added_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL,
            page INTEGER NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            format TEXT NOT NULL DEFAULT 'html',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(slug, page)
        );

        CREATE TABLE IF NOT EXISTS note_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_slug TEXT NOT NULL,
            note_page INTEGER NOT NULL,
            filename TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(note_slug, note_page, filename)
        );

        CREATE TABLE IF NOT EXISTS tags (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name  TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS book_tags (
            book_slug TEXT NOT NULL,
            tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE(book_slug, tag_id)
        );",
    )?;
    Ok(conn)
}
