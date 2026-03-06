use std::path::Path;

use crate::commands::ensure_axiomatic_dir;
use crate::models::Snip;

const SNIPS_FILE: &str = "snips.json";

/// Read all snips from the JSON file, returning an empty vec if the file does
/// not exist or is unreadable.
fn read_snips_file(dir_path: &str) -> Vec<Snip> {
    let path = Path::new(dir_path).join(".axiomatic").join(SNIPS_FILE);
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Write the full snips array back to the JSON file.
fn write_snips_file(dir_path: &str, snips: &[Snip]) -> Result<(), String> {
    let axiomatic_dir = ensure_axiomatic_dir(dir_path)?;
    let path = axiomatic_dir.join(SNIPS_FILE);
    let json = serde_json::to_string_pretty(snips).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| {
        format!("Failed to write {}: {}", path.display(), e)
    })
}

#[tauri::command]
pub fn list_snips(dir_path: String, slug: String) -> Result<Vec<Snip>, String> {
    let all = read_snips_file(&dir_path);
    let filtered: Vec<Snip> = all.into_iter().filter(|s| s.slug == slug).collect();
    Ok(filtered)
}

#[tauri::command]
pub fn create_snip(
    dir_path: String,
    slug: String,
    full_path: String,
    page: i64,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<Snip, String> {
    let mut all = read_snips_file(&dir_path);
    let now = chrono_now();
    let snip = Snip {
        id: uuid::Uuid::new_v4().to_string(),
        slug,
        full_path,
        page,
        label,
        x,
        y,
        width,
        height,
        created_at: now,
        tags: Vec::new(),
    };
    all.push(snip.clone());
    write_snips_file(&dir_path, &all)?;
    Ok(snip)
}

#[tauri::command]
pub fn delete_snip(dir_path: String, id: String) -> Result<(), String> {
    let mut all = read_snips_file(&dir_path);
    let before = all.len();
    all.retain(|s| s.id != id);
    if all.len() == before {
        // Snip not found is not an error -- idempotent delete
        return Ok(());
    }
    write_snips_file(&dir_path, &all)
}

#[tauri::command]
pub fn list_all_snips(dir_path: String) -> Result<Vec<Snip>, String> {
    Ok(read_snips_file(&dir_path))
}

#[tauri::command]
pub fn add_snip_tag(dir_path: String, snip_id: String, tag: String) -> Result<(), String> {
    let mut all = read_snips_file(&dir_path);
    let snip = all
        .iter_mut()
        .find(|s| s.id == snip_id)
        .ok_or_else(|| format!("Snip not found: {}", snip_id))?;
    if !snip.tags.contains(&tag) {
        snip.tags.push(tag);
    }
    write_snips_file(&dir_path, &all)
}

#[tauri::command]
pub fn remove_snip_tag(dir_path: String, snip_id: String, tag: String) -> Result<(), String> {
    let mut all = read_snips_file(&dir_path);
    let snip = all
        .iter_mut()
        .find(|s| s.id == snip_id)
        .ok_or_else(|| format!("Snip not found: {}", snip_id))?;
    snip.tags.retain(|t| t != &tag);
    write_snips_file(&dir_path, &all)
}

#[tauri::command]
pub fn list_all_snip_tags(dir_path: String) -> Result<Vec<String>, String> {
    let all = read_snips_file(&dir_path);
    let mut tags: Vec<String> = all
        .iter()
        .flat_map(|s| s.tags.iter().cloned())
        .collect();
    tags.sort();
    tags.dedup();
    Ok(tags)
}

/// Generate an ISO-8601 timestamp without pulling in the chrono crate.
fn chrono_now() -> String {
    // Use std::time to produce a simple UTC timestamp
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Convert to a basic ISO-8601 string: YYYY-MM-DDTHH:MM:SSZ
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Days since 1970-01-01
    let mut y = 1970i64;
    let mut remaining_days = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining_days < md as i64 {
            m = i;
            break;
        }
        remaining_days -= md as i64;
    }
    let d = remaining_days + 1;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        d,
        hours,
        minutes,
        seconds
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ================================================================
    // ac-122: Snip CRUD round-trip
    // ================================================================

    #[test]
    fn create_list_delete_snip_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // Initially empty
        let snips = list_snips(dir_path.clone(), "book-a".into()).unwrap();
        assert!(snips.is_empty());

        // Create a snip
        let snip = create_snip(
            dir_path.clone(),
            "book-a".into(),
            "/path/to/book.pdf".into(),
            3,
            "Definition 2.1".into(),
            0.1,
            0.2,
            0.5,
            0.3,
        ).unwrap();

        // Verify the created snip
        assert!(!snip.id.is_empty(), "ID should be a UUID string");
        assert_eq!(snip.slug, "book-a");
        assert_eq!(snip.full_path, "/path/to/book.pdf");
        assert_eq!(snip.page, 3);
        assert_eq!(snip.label, "Definition 2.1");
        assert!((snip.x - 0.1).abs() < f64::EPSILON);
        assert!((snip.y - 0.2).abs() < f64::EPSILON);
        assert!((snip.width - 0.5).abs() < f64::EPSILON);
        assert!((snip.height - 0.3).abs() < f64::EPSILON);
        assert!(!snip.created_at.is_empty(), "created_at should be set");
        // Verify UUID format (contains hyphens, 36 chars)
        assert_eq!(snip.id.len(), 36);
        assert_eq!(snip.id.chars().filter(|&c| c == '-').count(), 4);

        // List should return the snip
        let snips = list_snips(dir_path.clone(), "book-a".into()).unwrap();
        assert_eq!(snips.len(), 1);
        assert_eq!(snips[0].id, snip.id);
        assert_eq!(snips[0].label, "Definition 2.1");

        // Delete it
        delete_snip(dir_path.clone(), snip.id.clone()).unwrap();

        // List should be empty again
        let snips = list_snips(dir_path, "book-a".into()).unwrap();
        assert!(snips.is_empty());
    }

    #[test]
    fn list_snips_filters_by_slug() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        create_snip(
            dir_path.clone(), "book-a".into(), "/a.pdf".into(),
            1, "snip a".into(), 0.0, 0.0, 1.0, 1.0,
        ).unwrap();
        create_snip(
            dir_path.clone(), "book-b".into(), "/b.pdf".into(),
            1, "snip b".into(), 0.0, 0.0, 1.0, 1.0,
        ).unwrap();

        let a_snips = list_snips(dir_path.clone(), "book-a".into()).unwrap();
        assert_eq!(a_snips.len(), 1);
        assert_eq!(a_snips[0].label, "snip a");

        let b_snips = list_snips(dir_path, "book-b".into()).unwrap();
        assert_eq!(b_snips.len(), 1);
        assert_eq!(b_snips[0].label, "snip b");
    }

    #[test]
    fn delete_snip_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        // Deleting a nonexistent snip should succeed
        let result = delete_snip(dir_path, "nonexistent-id".into());
        assert!(result.is_ok());
    }

    #[test]
    fn snips_json_persists_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_string_lossy().to_string();

        create_snip(
            dir_path.clone(), "book-a".into(), "/a.pdf".into(),
            1, "persisted".into(), 0.0, 0.0, 1.0, 1.0,
        ).unwrap();

        // Verify the file exists on disk
        let snips_path = dir.path().join(".axiomatic").join("snips.json");
        assert!(snips_path.exists());

        // Verify the JSON content is valid
        let data = std::fs::read_to_string(&snips_path).unwrap();
        let parsed: Vec<Snip> = serde_json::from_str(&data).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].label, "persisted");
    }

    #[test]
    fn chrono_now_returns_iso8601() {
        let ts = chrono_now();
        // Should match pattern YYYY-MM-DDTHH:MM:SSZ
        assert_eq!(ts.len(), 20);
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        assert_eq!(&ts[13..14], ":");
        assert_eq!(&ts[16..17], ":");
        assert_eq!(&ts[19..20], "Z");
    }
}
