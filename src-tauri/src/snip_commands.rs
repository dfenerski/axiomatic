use tauri::State;

use crate::commands::DbState;
use crate::models::Snip;

fn row_to_snip(row: &rusqlite::Row) -> rusqlite::Result<Snip> {
    Ok(Snip {
        id: row.get(0)?,
        slug: row.get(1)?,
        full_path: row.get(2)?,
        page: row.get(3)?,
        label: row.get(4)?,
        x: row.get(5)?,
        y: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const SNIP_COLS: &str =
    "id, slug, full_path, page, label, x, y, width, height, created_at";

#[tauri::command]
pub fn list_snips(slug: String, state: State<'_, DbState>) -> Result<Vec<Snip>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SNIP_COLS} FROM snips WHERE slug = ? ORDER BY created_at"
        ))
        .map_err(|e| e.to_string())?;
    let snips = stmt
        .query_map([&slug], row_to_snip)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(snips)
}

#[tauri::command]
pub fn create_snip(
    slug: String,
    full_path: String,
    page: i64,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    state: State<'_, DbState>,
) -> Result<Snip, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO snips (slug, full_path, page, label, x, y, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![slug, full_path, page, label, x, y, width, height],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {SNIP_COLS} FROM snips WHERE id = ?"),
        [id],
        row_to_snip,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snip(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM snips WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
