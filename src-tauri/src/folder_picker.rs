use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(mobile)]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(mobile)]
pub struct FolderPickerHandle<R: Runtime>(PluginHandle<R>);

#[cfg(mobile)]
#[derive(serde::Deserialize)]
struct PickFolderResponse {
    path: String,
}

#[cfg(mobile)]
#[tauri::command]
pub async fn pick_folder<R: Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let handle = app.state::<FolderPickerHandle<R>>();
    let response = handle
        .0
        .run_mobile_plugin::<PickFolderResponse>("pickFolder", ())
        .map_err(|e| e.to_string())?;
    Ok(response.path)
}

#[cfg(not(mobile))]
#[tauri::command]
pub async fn pick_folder() -> Result<String, String> {
    Err("Folder picker is only available on mobile".into())
}

#[cfg(mobile)]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R, ()>::new("folder-picker")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.axiomatic.app", "FolderPickerPlugin")?;
            app.manage(FolderPickerHandle(handle));
            Ok(())
        })
        .build()
}

#[cfg(not(mobile))]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R, ()>::new("folder-picker").build()
}
