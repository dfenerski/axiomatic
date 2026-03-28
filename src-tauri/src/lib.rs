mod commands;
mod db;
mod folder_picker;
mod highlight_commands;
mod json_storage;
mod models;
mod pdf_commands;
mod pdf_engine;
mod pdf_models;
mod pdf_protocol;
mod session_commands;
mod snip_commands;

use commands::{DbState, PendingFile};
use pdf_commands::PdfState;
use pdf_models::new_shared_render_cache;
use pdfium_render::prelude::*;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use tauri::Manager;
#[cfg(not(mobile))]
use tauri::Emitter;

#[cfg(not(mobile))]
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

#[cfg(not(mobile))]
fn handle_file_open(app: &tauri::AppHandle, args: &[String]) {
    if let Some(path) = find_pdf_in_args(args) {
        let _ = app.emit("open-file", path);
    }
}

#[cfg(not(mobile))]
fn pdfium_lib_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "libpdfium.dylib"
    } else if cfg!(target_os = "windows") {
        "pdfium.dll"
    } else {
        "libpdfium.so"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (tx, rx) = crossbeam_channel::unbounded::<pdf_engine::PdfRequest>();
    let tx_protocol = tx.clone();
    let generation = Arc::new(AtomicU64::new(0));
    let gen_protocol = Arc::clone(&generation);
    let gen_render = Arc::clone(&generation);
    let render_cache = new_shared_render_cache();
    let cache_protocol = Arc::clone(&render_cache);
    let cache_render = Arc::clone(&render_cache);

    let mut builder = tauri::Builder::default();

    // Single-instance plugin is desktop-only (not available on mobile)
    #[cfg(not(mobile))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            handle_file_open(app, &args);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(folder_picker::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .register_asynchronous_uri_scheme_protocol("pdfium", move |_ctx, request, responder| {
            pdf_protocol::handle_async(&tx_protocol, &gen_protocol, &cache_protocol, request, responder)
        })
        .setup(move |app| {
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

            // Check CLI args for a PDF file path (desktop only)
            #[cfg(not(mobile))]
            let pending = {
                let args: Vec<String> = std::env::args().collect();
                find_pdf_in_args(&args)
            };
            #[cfg(mobile)]
            let pending: Option<String> = None;
            app.manage(PendingFile(Mutex::new(pending)));

            // PDFium initialization: find and verify the shared library.
            // Desktop: search resource_dir and dev fallback paths.
            // Mobile (Android): libpdfium.so is bundled in the APK via jniLibs;
            // dlopen("libpdfium.so") resolves it from the app's native lib dir.
            #[cfg(not(mobile))]
            let lib_path = {
                let lib_name = pdfium_lib_name();
                let path = app
                    .path()
                    .resource_dir()
                    .ok()
                    .and_then(|d| {
                        let nested = d.join("resources").join(lib_name);
                        let flat = d.join(lib_name);
                        if nested.exists() {
                            Some(nested)
                        } else if flat.exists() {
                            Some(flat)
                        } else {
                            None
                        }
                    })
                    .or_else(|| {
                        [
                            std::path::PathBuf::from("resources").join(lib_name),
                            std::path::PathBuf::from("src-tauri/resources").join(lib_name),
                        ]
                        .into_iter()
                        .find(|p| p.exists())
                    })
                    .unwrap_or_else(|| {
                        log::warn!(
                            "PDFium library ({}) not found — PDF rendering will fail. \
                             Download from https://github.com/bblanchon/pdfium-binaries",
                            lib_name
                        );
                        std::path::PathBuf::from(lib_name)
                    });

                log::info!("Loading PDFium from {:?}", path);
                Pdfium::bind_to_library(&path)
                    .map_err(|e| {
                        log::error!("Failed to bind to PDFium library at {:?}: {:?}", path, e);
                        format!("Failed to bind to PDFium: {:?}", e)
                    })?;
                log::info!("PDFium library verified");
                path
            };

            #[cfg(mobile)]
            let lib_path = {
                // On Android, libpdfium.so is packaged in the APK via jniLibs.
                // dlopen resolves bare "libpdfium.so" from the app's native lib directory.
                let path = std::path::PathBuf::from("libpdfium.so");
                log::info!("Loading PDFium from bundled shared library");
                Pdfium::bind_to_library(&path)
                    .map_err(|e| {
                        log::error!("Failed to bind to bundled PDFium: {:?}", e);
                        format!("Failed to bind to PDFium: {:?}", e)
                    })?;
                log::info!("PDFium library verified");
                path
            };

            let _render_workers = pdf_engine::run_pool(
                rx, lib_path, gen_render, cache_render, pdf_engine::worker_count(),
            );

            app.manage(PdfState {
                sender: tx,
                generation,
            });

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
            commands::open_url,
            commands::get_platform,
            commands::open_file,
            commands::import_pdf_register,
            folder_picker::pick_folder,
            commands::get_pending_file,
            commands::get_all_progress,
            commands::save_progress,
            commands::get_starred,
            commands::toggle_starred,
            commands::get_xp,
            commands::increment_xp,
            commands::detect_orphaned_slugs,
            commands::migrate_slug,
            highlight_commands::list_highlights,
            highlight_commands::create_highlight,
            highlight_commands::delete_highlight,
            highlight_commands::delete_highlight_group,
            pdf_commands::open_document,
            pdf_commands::close_document,
            pdf_commands::get_outline,
            pdf_commands::get_page_links,
            pdf_commands::extract_page_text,
            pdf_commands::search_document,
            pdf_commands::clip_pdf,
            pdf_commands::get_page_text_layer,
            pdf_commands::prerender_pages,
            snip_commands::list_snips,
            snip_commands::create_snip,
            snip_commands::delete_snip,
            snip_commands::list_all_snips,
            snip_commands::add_snip_tag,
            snip_commands::remove_snip_tag,
            snip_commands::list_all_snip_tags,
            snip_commands::rename_snip,
            snip_commands::bulk_add_snip_tag,
            snip_commands::bulk_remove_snip_tag,
            snip_commands::list_snip_tag_defs,
            snip_commands::create_snip_tag_def,
            snip_commands::delete_snip_tag_def,
            snip_commands::rename_snip_tag_def,
            snip_commands::recolor_snip_tag_def,
            session_commands::log_study_session,
            session_commands::increment_pomodoro_xp,
            session_commands::get_pomodoro_xp,
            session_commands::list_study_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
