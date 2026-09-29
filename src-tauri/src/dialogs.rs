//! Generic "Save As…" dialog for exported files (§2.11 Export). Not `media`'s import/purge
//! concerns — this just writes arbitrary bytes to a path the owner picks, so it gets its own
//! small module rather than growing `media.rs`.

use crate::error::AppResult;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Opens a native "Save As…" dialog defaulting to `default_name`, then writes `bytes` to the
/// chosen path. Returns `false` (no error) if the owner cancels the dialog, matching
/// `BrowserPlatform`'s `saveFile`, which always "succeeds" (a download can't be cancelled from
/// script) — the frontend treats both the same way.
#[tauri::command]
pub fn dialog_save_file(app: AppHandle, default_name: String, bytes: Vec<u8>) -> AppResult<bool> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    match path {
        Some(file_path) => {
            let resolved = file_path
                .into_path()
                .map_err(|e| crate::error::AppError::new("path_error", e.to_string()))?;
            std::fs::write(&resolved, &bytes)?;
            Ok(true)
        }
        None => Ok(false),
    }
}
