//! Machine-local settings (§5.5): wheel mode, reduce motion, dot grid density, minimap on/off —
//! things that belong to this computer, not the library. A single JSON blob at
//! `<app_local_data_dir>/settings.json`; the frontend owns the shape (same "thin Rust bridge"
//! pattern as `db_select`/`db_execute`) so a new field never needs a Rust change.

use crate::error::AppResult;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_local_data_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn machine_settings_read(app: AppHandle) -> AppResult<Option<String>> {
    let path = settings_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(path)?))
}

#[tauri::command]
pub fn machine_settings_write(app: AppHandle, json: String) -> AppResult<()> {
    let path = settings_path(&app)?;
    fs::write(path, json)?;
    Ok(())
}
