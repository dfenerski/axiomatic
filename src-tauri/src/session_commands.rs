use std::collections::HashMap;
use std::path::Path;

use crate::commands::ensure_axiomatic_dir;
use crate::models::{SessionEntry, StudySession};

const SESSIONS_FILE: &str = "sessions.json";
const POMODORO_XP_FILE: &str = "pomodoro-xp.json";

/// Read all sessions from the JSON file, returning an empty vec if the file
/// does not exist or is unreadable.
fn read_sessions_file(dir_path: &str) -> Vec<StudySession> {
    let path = Path::new(dir_path).join(".axiomatic").join(SESSIONS_FILE);
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Write the full sessions array back to the JSON file.
fn write_sessions_file(dir_path: &str, sessions: &[StudySession]) -> Result<(), String> {
    let axiomatic_dir = ensure_axiomatic_dir(dir_path)?;
    let path = axiomatic_dir.join(SESSIONS_FILE);
    let json = serde_json::to_string_pretty(sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| {
        format!("Failed to write {}: {}", path.display(), e)
    })
}

/// Read the pomodoro XP map from pomodoro-xp.json.
fn read_pomodoro_xp_file(dir_path: &str) -> HashMap<String, i64> {
    let path = Path::new(dir_path).join(".axiomatic").join(POMODORO_XP_FILE);
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// Write the pomodoro XP map back to pomodoro-xp.json.
fn write_pomodoro_xp_file(dir_path: &str, map: &HashMap<String, i64>) -> Result<(), String> {
    let axiomatic_dir = ensure_axiomatic_dir(dir_path)?;
    let path = axiomatic_dir.join(POMODORO_XP_FILE);
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| {
        format!("Failed to write {}: {}", path.display(), e)
    })
}

#[tauri::command]
pub fn log_study_session(sessions: Vec<SessionEntry>) -> Result<(), String> {
    for entry in sessions {
        let mut all = read_sessions_file(&entry.dir_path);
        all.push(entry.session);
        write_sessions_file(&entry.dir_path, &all)?;
    }
    Ok(())
}

#[tauri::command]
pub fn increment_pomodoro_xp(dir_path: String, slug: String) -> Result<i64, String> {
    let mut map = read_pomodoro_xp_file(&dir_path);
    let entry = map.entry(slug).or_insert(0);
    *entry += 1;
    let new_value = *entry;
    write_pomodoro_xp_file(&dir_path, &map)?;
    Ok(new_value)
}

#[tauri::command]
pub fn get_pomodoro_xp(dir_path: String, slug: String) -> Result<i64, String> {
    let map = read_pomodoro_xp_file(&dir_path);
    Ok(map.get(&slug).copied().unwrap_or(0))
}

#[tauri::command]
pub fn list_study_sessions(dir_path: String) -> Result<Vec<StudySession>, String> {
    Ok(read_sessions_file(&dir_path))
}
