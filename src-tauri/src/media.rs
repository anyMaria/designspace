//! Media import, cache and reveal/purge commands (§4.4). Duplicate detection happens here
//! (Rust hashes the incoming bytes and checks `items.file_hash` before ever writing a new file),
//! since the frontend doesn't know the hash until Rust computes it.

use crate::error::{AppError, AppResult};
use crate::state::{AppState, ChunkedUpload};
use chrono::Datelike;
use designspace_core::{hash::sha256_hex, media_naming::media_rel_path, path_safety};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub rel_path: String,
    pub hash: String,
    pub size: u64,
    pub mime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicate_of: Option<String>,
}

fn guess_mime(name: &str, bytes: &[u8]) -> String {
    if let Some(kind) = infer::get(bytes) {
        return kind.mime_type().to_string();
    }
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "svg" => "image/svg+xml",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn find_duplicate(conn: &Connection, hash: &str) -> rusqlite::Result<Option<(String, String)>> {
    conn.query_row(
        "SELECT id, file_path FROM items WHERE file_hash = ?1
         ORDER BY deleted_at IS NULL DESC, created_at DESC LIMIT 1",
        params![hash],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

/// The last 6 characters of a fresh ULID — unique and short, matching the `slug-id.ext` naming
/// in §5.1. It's independent of the eventual `items.id`: Rust imports the file before the
/// frontend has created that row (§4.1 example flow).
fn short_suffix() -> String {
    let ulid = ulid::Ulid::generate().to_string();
    ulid[ulid.len() - 6..].to_ascii_lowercase()
}

fn import_bytes(
    conn: &Connection,
    library_root: &Path,
    name: &str,
    bytes: &[u8],
) -> AppResult<ImportResult> {
    let hash = sha256_hex(bytes);
    let mime = guess_mime(name, bytes);

    if let Some((id, rel_path)) = find_duplicate(conn, &hash)? {
        return Ok(ImportResult {
            rel_path,
            hash,
            size: bytes.len() as u64,
            mime,
            duplicate_of: Some(id),
        });
    }

    let now = chrono::Utc::now();
    let rel_path = media_rel_path(now.year(), now.month(), &short_suffix(), name);
    let full_path = library_root.join(&rel_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&full_path, bytes)?;

    Ok(ImportResult {
        rel_path,
        hash,
        size: bytes.len() as u64,
        mime,
        duplicate_of: None,
    })
}

/// v1 supported extensions (§2.3). Folder import only offers what M1 can actually ingest
/// (images) — deviation logged in docs/DECISIONS.md: the plan's "Supported files" table also
/// lists video/PDF/font, but no ingest worker or card exists for those kinds yet.
const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"];

fn is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Recursively lists a folder's files, split into supported and skipped counts (§2.3's
/// "Add 342 files? (12 unsupported files will be skipped)" confirmation).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    pub paths: Vec<String>,
    pub skipped: u32,
}

fn list_folder(root: &Path) -> AppResult<FolderListing> {
    let mut paths = Vec::new();
    let mut skipped = 0u32;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file() {
                if is_supported(&path) {
                    paths.push(path.to_string_lossy().into_owned());
                } else {
                    skipped += 1;
                }
            }
        }
    }
    Ok(FolderListing { paths, skipped })
}

#[tauri::command]
pub fn media_list_folder(path: String) -> AppResult<FolderListing> {
    list_folder(Path::new(&path))
}

fn with_library<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Connection, &Path) -> AppResult<T>,
) -> AppResult<T> {
    let guard = state.library.lock().expect("library mutex poisoned");
    let handle = guard
        .as_ref()
        .ok_or_else(|| AppError::new("no_library", "No library is open"))?;
    f(&handle.conn, &handle.path)
}

#[tauri::command]
pub fn media_import_bytes(
    state: State<'_, AppState>,
    name: String,
    bytes: Vec<u8>,
) -> AppResult<ImportResult> {
    with_library(&state, |conn, root| import_bytes(conn, root, &name, &bytes))
}

#[tauri::command]
pub fn media_import_paths(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> AppResult<Vec<ImportResult>> {
    with_library(&state, |conn, root| {
        paths
            .iter()
            .map(|p| {
                let bytes = fs::read(p)?;
                let name = Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| p.clone());
                import_bytes(conn, root, &name, &bytes)
            })
            .collect()
    })
}

#[tauri::command]
pub fn media_import_begin(
    state: State<'_, AppState>,
    name: String,
    size: u64,
) -> AppResult<String> {
    let token = ulid::Ulid::generate().to_string();
    state
        .uploads
        .lock()
        .expect("uploads mutex poisoned")
        .insert(
            token.clone(),
            ChunkedUpload {
                name,
                buffer: Vec::with_capacity(size.min(64 * 1024 * 1024) as usize),
            },
        );
    Ok(token)
}

#[tauri::command]
pub fn media_import_chunk(
    state: State<'_, AppState>,
    token: String,
    bytes: Vec<u8>,
) -> AppResult<()> {
    let mut uploads = state.uploads.lock().expect("uploads mutex poisoned");
    let upload = uploads
        .get_mut(&token)
        .ok_or_else(|| AppError::new("unknown_upload", "Unknown or expired upload token"))?;
    upload.buffer.extend_from_slice(&bytes);
    Ok(())
}

#[tauri::command]
pub fn media_import_finish(state: State<'_, AppState>, token: String) -> AppResult<ImportResult> {
    let upload = state
        .uploads
        .lock()
        .expect("uploads mutex poisoned")
        .remove(&token)
        .ok_or_else(|| AppError::new("unknown_upload", "Unknown or expired upload token"))?;
    with_library(&state, |conn, root| {
        import_bytes(conn, root, &upload.name, &upload.buffer)
    })
}

#[tauri::command]
pub fn media_reveal(state: State<'_, AppState>, rel_path: String) -> AppResult<()> {
    with_library(&state, |_conn, root| {
        let resolved = path_safety::resolve_existing(root, &rel_path)
            .map_err(|e| AppError::new("not_found", e.to_string()))?;
        tauri_plugin_opener::reveal_item_in_dir(resolved)
            .map_err(|e| AppError::new("reveal_failed", e.to_string()))
    })
}

#[tauri::command]
pub fn media_purge(state: State<'_, AppState>, rel_paths: Vec<String>) -> AppResult<()> {
    with_library(&state, |_conn, root| {
        let resolved: Vec<_> = rel_paths
            .iter()
            .filter_map(|p| path_safety::resolve_existing(root, p).ok())
            .collect();
        if !resolved.is_empty() {
            trash::delete_all(&resolved)
                .map_err(|e| AppError::new("purge_failed", e.to_string()))?;
        }
        Ok(())
    })
}

fn cache_dir(app: &AppHandle, library_id: &str) -> AppResult<std::path::PathBuf> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::new("path_error", e.to_string()))?
        .join("cache")
        .join(library_id);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Cache keys are opaque strings (often containing `/`, e.g. `t128/<itemId>`); flatten them into
/// a single safe file name rather than trusting them as a nested path.
fn cache_file_name(key: &str) -> String {
    key.replace(['/', '\\'], "_").replace("..", "_")
}

fn current_library_id(state: &State<'_, AppState>) -> AppResult<String> {
    let guard = state.library.lock().expect("library mutex poisoned");
    guard
        .as_ref()
        .map(|h| h.id.clone())
        .ok_or_else(|| AppError::new("no_library", "No library is open"))
}

#[tauri::command]
pub fn cache_put(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    bytes: Vec<u8>,
) -> AppResult<()> {
    let dir = cache_dir(&app, &current_library_id(&state)?)?;
    fs::write(dir.join(cache_file_name(&key)), bytes)?;
    Ok(())
}

#[tauri::command]
pub fn cache_has(
    app: AppHandle,
    state: State<'_, AppState>,
    keys: Vec<String>,
) -> AppResult<Vec<bool>> {
    let dir = cache_dir(&app, &current_library_id(&state)?)?;
    Ok(keys
        .iter()
        .map(|k| dir.join(cache_file_name(k)).is_file())
        .collect())
}

#[tauri::command]
pub fn cache_delete(app: AppHandle, state: State<'_, AppState>, prefix: String) -> AppResult<()> {
    let dir = cache_dir(&app, &current_library_id(&state)?)?;
    let needle = cache_file_name(&prefix);
    for entry in fs::read_dir(&dir)?.flatten() {
        if entry.file_name().to_string_lossy().starts_with(&needle) {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn items_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE items (
                id TEXT PRIMARY KEY,
                file_hash TEXT,
                file_path TEXT,
                created_at TEXT,
                deleted_at TEXT
            );",
        )
        .unwrap();
    }

    #[test]
    fn imports_a_new_file_and_writes_it_under_media() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        items_table(&conn);

        let result = import_bytes(&conn, dir.path(), "Poster.jpg", b"fake jpeg bytes").unwrap();
        assert!(result.duplicate_of.is_none());
        assert!(result.rel_path.starts_with("media/"));
        assert!(result.rel_path.ends_with(".jpg"));
        assert!(dir.path().join(&result.rel_path).is_file());
        assert_eq!(result.mime, "image/jpeg");
    }

    #[test]
    fn a_second_import_of_the_same_bytes_is_reported_as_a_duplicate() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        items_table(&conn);

        let first = import_bytes(&conn, dir.path(), "a.jpg", b"same bytes").unwrap();
        conn.execute(
            "INSERT INTO items (id, file_hash, file_path, created_at) VALUES ('item1', ?1, ?2, '2026-01-01')",
            params![first.hash, first.rel_path],
        )
        .unwrap();

        let second = import_bytes(&conn, dir.path(), "b.jpg", b"same bytes").unwrap();
        assert_eq!(second.duplicate_of.as_deref(), Some("item1"));
        assert_eq!(second.rel_path, first.rel_path);
    }

    #[test]
    fn different_bytes_are_not_flagged_as_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        items_table(&conn);

        let first = import_bytes(&conn, dir.path(), "a.jpg", b"content one").unwrap();
        conn.execute(
            "INSERT INTO items (id, file_hash, file_path, created_at) VALUES ('item1', ?1, ?2, '2026-01-01')",
            params![first.hash, first.rel_path],
        )
        .unwrap();

        let second = import_bytes(&conn, dir.path(), "b.jpg", b"content two").unwrap();
        assert!(second.duplicate_of.is_none());
    }

    #[test]
    fn cache_file_name_flattens_slashes_and_traversal() {
        assert_eq!(cache_file_name("t128/abc123"), "t128_abc123");
        assert_eq!(cache_file_name("../../etc/passwd"), "____etc_passwd");
    }

    #[test]
    fn list_folder_finds_supported_files_recursively_and_counts_skipped_ones() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.jpg"), b"x").unwrap();
        fs::write(dir.path().join("notes.txt"), b"x").unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("b.PNG"), b"x").unwrap();
        fs::write(sub.join("clip.mp4"), b"x").unwrap();

        let listing = list_folder(dir.path()).unwrap();
        assert_eq!(listing.paths.len(), 2);
        assert_eq!(listing.skipped, 2);
        assert!(listing.paths.iter().any(|p| p.ends_with("a.jpg")));
        assert!(listing.paths.iter().any(|p| p.ends_with("b.PNG")));
    }

    #[test]
    fn list_folder_on_an_empty_directory_finds_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let listing = list_folder(dir.path()).unwrap();
        assert!(listing.paths.is_empty());
        assert_eq!(listing.skipped, 0);
    }
}
