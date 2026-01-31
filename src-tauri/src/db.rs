use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_db(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS directories (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            path  TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            added_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;
    Ok(conn)
}
