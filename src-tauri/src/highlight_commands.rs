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

#[tauri::command]
pub fn list_highlights(slug: String, state: State<'_, DbState>) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {HIGHLIGHT_COLS} FROM highlights WHERE slug = ? ORDER BY page, id"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&slug], row_to_highlight)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
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
pub fn delete_highlight(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM highlights WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_highlight_group(group_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM highlights WHERE group_id = ?", [&group_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
