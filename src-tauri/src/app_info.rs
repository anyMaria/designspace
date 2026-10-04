//! `app_paths` and `open_logs` (§4.4) — used by Settings → About.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFileInfo {
    pub name: String,
    pub present: bool,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemReportInfo {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub webview_version: Option<String>,
    pub library_id: String,
    pub stored_library_id: Option<String>,
    pub cache_folder_count: u32,
    pub cache_file_count: u32,
    pub models: Vec<ModelFileInfo>,
    pub log_tail: String,
}

const MODEL_DIR: &str = "models/Xenova/clip-vit-base-patch32/onnx";
const MODEL_FILES: [&str; 2] = ["vision_model_quantized.onnx", "text_model_quantized.onnx"];
const LOG_TAIL_LINES: usize = 200;

/// The last `max_lines` lines of `text`, joined back with newlines. Pure and unit-tested.
fn tail_lines(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn count_dir_entries(dir: &Path, want_dirs: bool) -> u32 {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.file_type()
                        .map(|t| t.is_dir() == want_dirs)
                        .unwrap_or(false)
                })
                .count() as u32
        })
        .unwrap_or(0)
}

fn newest_log_tail(logs: &Path) -> String {
    let newest = fs::read_dir(logs)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "log"))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(modified, _)| *modified);
    match newest {
        Some((_, path)) => fs::read(path)
            .map(|bytes| tail_lines(&String::from_utf8_lossy(&bytes), LOG_TAIL_LINES))
            .unwrap_or_default(),
        None => String::new(),
    }
}

/// What the owner's PC sees, for Settings → About → "Copy a problem report" (Patch 2 · A12).
/// No item titles or file names; the log tail is whatever the log itself contains.
#[tauri::command]
pub fn problem_report_info(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ProblemReportInfo> {
    let (library_id, stored_library_id) = {
        let guard = state.library.lock().expect("library mutex poisoned");
        let handle = guard
            .as_ref()
            .ok_or_else(|| AppError::new("no_library", "No library is open"))?;
        let stored = handle
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'library_id'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .unwrap_or(None);
        (handle.id.clone(), stored)
    };

    let cache_root = app.path().app_local_data_dir()?.join("cache");
    let resource_dir = app.path().resource_dir()?;
    let models = MODEL_FILES
        .iter()
        .map(|name| {
            let bytes = fs::metadata(resource_dir.join(MODEL_DIR).join(name))
                .map(|m| m.len())
                .ok();
            ModelFileInfo {
                name: (*name).to_string(),
                present: bytes.is_some(),
                bytes: bytes.unwrap_or(0),
            }
        })
        .collect();

    Ok(ProblemReportInfo {
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        webview_version: tauri::webview_version().ok(),
        cache_folder_count: count_dir_entries(&cache_root, true),
        cache_file_count: count_dir_entries(&cache_root.join(&library_id), false),
        library_id,
        stored_library_id,
        models,
        log_tail: newest_log_tail(&app.path().app_log_dir()?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tail_lines_keeps_only_the_last_lines() {
        assert_eq!(tail_lines("a\nb\nc\nd", 2), "c\nd");
        assert_eq!(tail_lines("a\nb", 5), "a\nb");
        assert_eq!(tail_lines("", 3), "");
    }
}
