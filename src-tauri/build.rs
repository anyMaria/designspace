// Every `#[tauri::command]` we define ourselves (not from a plugin) needs an `allow-<command>`
// permission generated for it — otherwise the webview's `invoke()` calls are rejected by the
// ACL at runtime even though they compile fine. See capabilities/default.json for where these
// get granted, and https://v2.tauri.app/develop/plugins/ ("commands" on `AppManifest`).
const APP_COMMANDS: &[&str] = &[
    "library_create",
    "library_open",
    "library_info",
    "library_close",
    "recent_libraries",
    "db_select",
    "db_execute",
    "db_batch",
    "media_import_bytes",
    "media_import_paths",
    "media_import_begin",
    "media_import_chunk",
    "media_import_finish",
    "media_reveal",
    "media_purge",
    "media_list_folder",
    "cache_put",
    "cache_has",
    "cache_delete",
    "backup_now",
    "backup_list",
    "backup_restore",
    "app_paths",
    "open_logs",
    "dialog_save_file",
];

fn main() {
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
