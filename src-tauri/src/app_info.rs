//! `app_paths` and `open_logs` (§4.4) — used by Settings → About.

use crate::error::AppResult;
use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub app_local_data_dir: String,
    pub logs_dir: String,
}

#[tauri::command]
pub fn app_paths(app: AppHandle) -> AppResult<AppPaths> {
    let local = app.path().app_local_data_dir()?;
    let logs = app.path().app_log_dir()?;
    Ok(AppPaths {
        app_local_data_dir: local.to_string_lossy().into_owned(),
        logs_dir: logs.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn open_logs(app: AppHandle) -> AppResult<()> {
    let logs = app.path().app_log_dir()?;
    fs::create_dir_all(&logs)?;
    tauri_plugin_opener::reveal_item_in_dir(&logs)
        .map_err(|e| crate::error::AppError::new("reveal_failed", e.to_string()))?;
    Ok(())
}
