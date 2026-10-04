//! Library create/open and the recent-libraries list (§4.4). The database schema itself is not
//! Rust's concern — the frontend's TypeScript migrator runs the same SQL here and in the
//! browser build (§5.3); Rust only opens the connection and remembers where libraries live.

use crate::error::{AppError, AppResult};
use crate::state::{AppState, LibraryHandle};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryInfo {
    pub id: String,
    pub path: String,
    pub name: String,
}

#[derive(Default, Serialize, Deserialize)]
struct Settings {
    #[serde(default)]
    recent_libraries: Vec<LibraryInfo>,
}

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::new("path_error", e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> AppResult<Settings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let bytes = fs::read(&path)?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

fn save_settings(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    let path = settings_path(app)?;
    fs::write(path, serde_json::to_vec_pretty(settings)?)?;
    Ok(())
}

fn remember_recent(app: &AppHandle, info: &LibraryInfo) -> AppResult<()> {
    let mut settings = load_settings(app)?;
    settings.recent_libraries.retain(|l| l.path != info.path);
    settings.recent_libraries.insert(0, info.clone());
    settings.recent_libraries.truncate(10);
    save_settings(app, &settings)
}

fn default_library_path(app: &AppHandle) -> AppResult<PathBuf> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| AppError::new("path_error", e.to_string()))?;
    Ok(documents.join("Designspace Library"))
}

const README_TEXT: &str = "This folder is a Designspace library.\n\n\
It holds your original files (media/), the library database (designspace.db) and automatic\n\
backups (backups/). Keep this folder on your own computer, not inside a cloud-synced folder\n\
(OneDrive, Dropbox, Google Drive) -- cloud sync can corrupt the database while the app runs.\n";

fn bootstrap_folder(root: &Path) -> AppResult<()> {
    fs::create_dir_all(root.join("media"))?;
    fs::create_dir_all(root.join("backups"))?;
    let readme = root.join("README.txt");
    if !readme.exists() {
        fs::write(readme, README_TEXT)?;
    }
    Ok(())
}

fn open_connection(root: &Path) -> AppResult<Connection> {
    let conn = Connection::open(root.join("designspace.db"))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    Ok(conn)
}

/// Reads `meta.library_id`, storing a new one if it's missing. A brand-new database has no `meta`
/// yet (the frontend migrator creates it), so the id is only minted here and `ensureLibraryReady`
/// stores it right after migrating. The cache folder is named after this id.
fn ensure_library_id(conn: &Connection) -> rusqlite::Result<String> {
    let has_meta: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
        [],
        |row| row.get::<_, i64>(0),
    )? > 0;
    if !has_meta {
        return Ok(ulid::Ulid::generate().to_string());
    }
    conn.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES ('library_id', ?1)",
        [ulid::Ulid::generate().to_string()],
    )?;
    conn.query_row(
        "SELECT value FROM meta WHERE key = 'library_id'",
        [],
        |row| row.get(0),
    )
}

/// The ids of the libraries in the recent list, for pruning cache folders nobody uses any more.
pub fn recent_library_ids(app: &AppHandle) -> AppResult<std::collections::HashSet<String>> {
    Ok(load_settings(app)?
        .recent_libraries
        .into_iter()
        .map(|l| l.id)
        .collect())
}

fn open_library(app: &AppHandle, state: &State<AppState>, root: PathBuf) -> AppResult<LibraryInfo> {
    bootstrap_folder(&root)?;
    let conn = open_connection(&root)?;
    let id = ensure_library_id(&conn)?;
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Library".to_string());

    let info = LibraryInfo {
        id: id.clone(),
        path: root.to_string_lossy().into_owned(),
        name: name.clone(),
    };

    *state.library.lock().expect("library mutex poisoned") = Some(LibraryHandle {
        id,
        name,
        path: root,
        conn,
    });

    remember_recent(app, &info)?;
    Ok(info)
}

#[tauri::command]
pub fn library_create(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<LibraryInfo> {
    let root = match path {
        Some(p) => PathBuf::from(p),
        None => default_library_path(&app)?,
    };
    open_library(&app, &state, root)
}

#[tauri::command]
pub fn library_open(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<LibraryInfo> {
    let root = match path {
        Some(p) => PathBuf::from(p),
        None => default_library_path(&app)?,
    };
    open_library(&app, &state, root)
}

#[tauri::command]
pub fn recent_libraries(app: AppHandle) -> AppResult<Vec<LibraryInfo>> {
    Ok(load_settings(&app)?.recent_libraries)
}

#[tauri::command]
pub fn library_info(state: State<'_, AppState>) -> AppResult<Option<LibraryInfo>> {
    let guard = state.library.lock().expect("library mutex poisoned");
    Ok(guard.as_ref().map(|h| LibraryInfo {
        id: h.id.clone(),
        path: h.path.to_string_lossy().into_owned(),
        name: h.name.clone(),
    }))
}

#[tauri::command]
pub fn library_close(state: State<'_, AppState>) -> AppResult<()> {
    *state.library.lock().expect("library mutex poisoned") = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_folder_creates_media_backups_and_readme() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("My Library");
        bootstrap_folder(&root).unwrap();

        assert!(root.join("media").is_dir());
        assert!(root.join("backups").is_dir());
        assert!(root.join("README.txt").is_file());
    }

    #[test]
    fn bootstrap_folder_does_not_overwrite_an_existing_readme() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        bootstrap_folder(&root).unwrap();
        fs::write(root.join("README.txt"), "customized").unwrap();

        bootstrap_folder(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("README.txt")).unwrap(),
            "customized"
        );
    }

    #[test]
    fn ensure_library_id_mints_a_ulid_for_a_fresh_database() {
        let conn = Connection::open_in_memory().unwrap();
        let id = ensure_library_id(&conn).unwrap();
        assert_eq!(id.len(), 26);
    }

    #[test]
    fn ensure_library_id_reuses_an_existing_one() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO meta (key, value) VALUES ('library_id', 'fixed-id-123');",
        )
        .unwrap();
        assert_eq!(ensure_library_id(&conn).unwrap(), "fixed-id-123");
    }

    #[test]
    fn opening_a_migrated_library_twice_reuses_the_same_id() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Library");
        bootstrap_folder(&root).unwrap();
        // What the frontend migrator leaves: `meta` with only schema_version.
        open_connection(&root)
            .unwrap()
            .execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO meta (key, value) VALUES ('schema_version', '2');",
            )
            .unwrap();
        let id1 = ensure_library_id(&open_connection(&root).unwrap()).unwrap();
        let id2 = ensure_library_id(&open_connection(&root).unwrap()).unwrap();
        assert_eq!(id1, id2);
    }

    #[test]
    fn a_database_without_meta_gets_an_id_and_still_has_no_meta_table() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Library");
        bootstrap_folder(&root).unwrap();
        let conn = open_connection(&root).unwrap();
        let id = ensure_library_id(&conn).unwrap();
        assert!(ulid::Ulid::from_string(&id).is_ok());
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'meta'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 0);
    }
}
