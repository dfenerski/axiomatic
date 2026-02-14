mod commands;
mod db;
mod models;

use commands::{DbState, PendingFile};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

fn find_pdf_in_args(args: &[String]) -> Option<String> {
    for arg in args.iter().skip(1) {
        // Skip flags
        if arg.starts_with('-') {
            continue;
        }
        // Handle file:// URLs
        if let Some(path) = arg.strip_prefix("file://") {
            let decoded = url::form_urlencoded::parse(path.as_bytes())
                .map(|(k, v)| if v.is_empty() { k.to_string() } else { format!("{}={}", k, v) })
                .collect::<String>();
            if decoded.to_lowercase().ends_with(".pdf") {
                return Some(decoded);
            }
        }
        if arg.to_lowercase().ends_with(".pdf") {
            return Some(arg.clone());
        }
    }
    None
}

fn handle_file_open(app: &tauri::AppHandle, args: &[String]) {
    if let Some(path) = find_pdf_in_args(args) {
        let _ = app.emit("open-file", path);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_file_open(app, &args);
            // Focus the main window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db_path = app_data.join("axiomatic.db");
            let conn = db::init_db(&db_path).expect("failed to init database");
            app.manage(DbState(Mutex::new(conn)));

            // Check CLI args for a PDF file path
            let args: Vec<String> = std::env::args().collect();
            let pending = find_pdf_in_args(&args);
            app.manage(PendingFile(Mutex::new(pending)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_directories,
            commands::add_directory,
            commands::remove_directory,
            commands::list_textbooks,
            commands::rename_textbook,
            commands::delete_textbook,
            commands::detect_os_theme,
            commands::read_file_bytes,
            commands::get_note,
            commands::set_note,
            commands::list_notes_for_book,
            commands::delete_note,
            commands::save_note_image,
            commands::get_note_image,
            commands::export_notes_for_book,
            commands::migrate_notes_from_json,
            commands::list_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::update_tag_color,
            commands::tag_book,
            commands::untag_book,
            commands::list_book_tags_all,
            commands::get_platform,
            commands::open_file,
            commands::get_pending_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
