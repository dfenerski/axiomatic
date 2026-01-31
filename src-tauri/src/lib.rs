mod commands;
mod db;
mod models;

use commands::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
