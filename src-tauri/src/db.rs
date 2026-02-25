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
        );

        CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL,
            page INTEGER NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            color TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_highlights_slug_page ON highlights(slug, page);

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL,
            page INTEGER NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(slug, page)
        );",
    )?;
    // Migrations: add text and group_id columns to highlights
    conn.execute_batch("ALTER TABLE highlights ADD COLUMN text TEXT NOT NULL DEFAULT ''").ok();
    conn.execute_batch("ALTER TABLE highlights ADD COLUMN group_id TEXT NOT NULL DEFAULT ''").ok();
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_highlights_group_id ON highlights(group_id)").ok();

    // Migration: create snips table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS snips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL,
            full_path TEXT NOT NULL DEFAULT '',
            page INTEGER NOT NULL,
            label TEXT NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_snips_slug ON snips(slug);",
    ).ok();

    Ok(conn)
}
