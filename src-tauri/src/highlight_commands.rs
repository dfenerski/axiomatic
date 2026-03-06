use rusqlite::Connection;
use tauri::State;

use crate::commands::DbState;
use crate::models::Highlight;

fn row_to_highlight(row: &rusqlite::Row) -> rusqlite::Result<Highlight> {
    Ok(Highlight {
        id: row.get(0)?,
        slug: row.get(1)?,
        page: row.get(2)?,
        x: row.get(3)?,
        y: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        color: row.get(7)?,
        note: row.get(8)?,
        text: row.get(9)?,
        group_id: row.get(10)?,
        created_at: row.get(11)?,
    })
}

const HIGHLIGHT_COLS: &str =
    "id, slug, page, x, y, width, height, color, note, text, group_id, created_at";

pub fn list_highlights_inner(conn: &Connection, slug: &str) -> Result<Vec<Highlight>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {HIGHLIGHT_COLS} FROM highlights WHERE slug = ? ORDER BY page, id"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([slug], row_to_highlight)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_highlights(slug: String, state: State<'_, DbState>) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list_highlights_inner(&conn, &slug)
}

pub fn create_highlight_inner(
    conn: &Connection,
    slug: &str,
    page: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    color: &str,
    note: &str,
    text: &str,
    group_id: &str,
) -> Result<Highlight, String> {
    conn.execute(
        "INSERT INTO highlights (slug, page, x, y, width, height, color, note, text, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![slug, page, x, y, width, height, color, note, text, group_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {HIGHLIGHT_COLS} FROM highlights WHERE id = ?"),
        [id],
        row_to_highlight,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_highlight(
    slug: String,
    page: i64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    color: String,
    note: String,
    text: String,
    group_id: String,
    state: State<'_, DbState>,
) -> Result<Highlight, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_highlight_inner(&conn, &slug, page, x, y, width, height, &color, &note, &text, &group_id)
}

pub fn delete_highlight_inner(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM highlights WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_highlight(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_highlight_inner(&conn, id)
}

pub fn delete_highlight_group_inner(conn: &Connection, group_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM highlights WHERE group_id = ?", [group_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_highlight_group(group_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_highlight_group_inner(&conn, &group_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Helper: create a fully migrated SQLite database in a TempDir.
    fn test_db() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = db::init_db(&db_path).unwrap();
        (dir, conn)
    }

    // ================================================================
    // ac-145: Highlight CRUD
    // ================================================================

    #[test]
    fn create_and_list_highlight() {
        let (_dir, conn) = test_db();

        let hl = create_highlight_inner(
            &conn, "book-a", 5, 0.1, 0.2, 0.5, 0.05, "yellow", "", "selected text", "g1",
        ).unwrap();

        assert!(hl.id > 0);
        assert_eq!(hl.slug, "book-a");
        assert_eq!(hl.page, 5);
        assert!((hl.x - 0.1).abs() < f64::EPSILON);
        assert!((hl.y - 0.2).abs() < f64::EPSILON);
        assert!((hl.width - 0.5).abs() < f64::EPSILON);
        assert!((hl.height - 0.05).abs() < f64::EPSILON);
        assert_eq!(hl.color, "yellow");
        assert_eq!(hl.text, "selected text");
        assert_eq!(hl.group_id, "g1");

        // List returns it
        let highlights = list_highlights_inner(&conn, "book-a").unwrap();
        assert_eq!(highlights.len(), 1);
        assert_eq!(highlights[0].id, hl.id);
    }

    #[test]
    fn list_highlights_filters_by_slug() {
        let (_dir, conn) = test_db();

        create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.0, 1.0, 1.0, "yellow", "", "", "g1",
        ).unwrap();
        create_highlight_inner(
            &conn, "book-b", 1, 0.0, 0.0, 1.0, 1.0, "blue", "", "", "g2",
        ).unwrap();

        let a_highlights = list_highlights_inner(&conn, "book-a").unwrap();
        assert_eq!(a_highlights.len(), 1);
        assert_eq!(a_highlights[0].color, "yellow");

        let b_highlights = list_highlights_inner(&conn, "book-b").unwrap();
        assert_eq!(b_highlights.len(), 1);
        assert_eq!(b_highlights[0].color, "blue");
    }

    #[test]
    fn delete_highlight_removes_single() {
        let (_dir, conn) = test_db();

        let hl1 = create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.0, 1.0, 1.0, "yellow", "", "", "g1",
        ).unwrap();
        let hl2 = create_highlight_inner(
            &conn, "book-a", 2, 0.0, 0.0, 1.0, 1.0, "green", "", "", "g2",
        ).unwrap();

        delete_highlight_inner(&conn, hl1.id).unwrap();

        let highlights = list_highlights_inner(&conn, "book-a").unwrap();
        assert_eq!(highlights.len(), 1);
        assert_eq!(highlights[0].id, hl2.id);
    }

    #[test]
    fn delete_highlight_group_removes_all_in_group() {
        let (_dir, conn) = test_db();

        create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.0, 0.5, 0.05, "yellow", "", "line 1", "shared-group",
        ).unwrap();
        create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.1, 0.5, 0.05, "yellow", "", "line 2", "shared-group",
        ).unwrap();
        create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.2, 0.5, 0.05, "blue", "", "other", "other-group",
        ).unwrap();

        // Delete the shared group
        delete_highlight_group_inner(&conn, "shared-group").unwrap();

        let highlights = list_highlights_inner(&conn, "book-a").unwrap();
        assert_eq!(highlights.len(), 1);
        assert_eq!(highlights[0].group_id, "other-group");
    }

    #[test]
    fn create_highlight_returns_with_created_at() {
        let (_dir, conn) = test_db();

        let hl = create_highlight_inner(
            &conn, "book-a", 1, 0.0, 0.0, 1.0, 1.0, "red", "my note", "text", "g1",
        ).unwrap();

        assert!(!hl.created_at.is_empty(), "created_at should be populated");
        assert_eq!(hl.note, "my note");
    }
}
