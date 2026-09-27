mod app_info;
mod backups;
mod db;
mod error;
mod library;
mod media;
mod media_protocol;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            library::library_create,
            library::library_open,
            library::library_info,
            library::library_close,
            library::recent_libraries,
            db::db_select,
            db::db_execute,
            db::db_batch,
            media::media_import_bytes,
            media::media_import_paths,
            media::media_import_begin,
            media::media_import_chunk,
            media::media_import_finish,
            media::media_reveal,
            media::media_purge,
            media::cache_put,
            media::cache_has,
            media::cache_delete,
            backups::backup_now,
            backups::backup_list,
            backups::backup_restore,
            app_info::app_paths,
            app_info::open_logs,
        ]);

    let builder = media_protocol::register(builder);

    builder
        .run(tauri::generate_context!())
        .expect("error while running the Designspace application");
}
