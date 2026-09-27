//! Automatic backups (§5.4): `VACUUM INTO`, keeping the 14 most recent daily backups plus 8
//! weekly ones. `backup_restore` saves the current DB as `pre-restore-…` first.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::{DateTime, Datelike, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

const DAILY_KEEP: usize = 14;
const WEEKLY_KEEP: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

fn backups_dir(library_root: &Path) -> PathBuf {
    library_root.join("backups")
}

fn list_backup_files(dir: &Path) -> AppResult<Vec<(PathBuf, DateTime<Utc>, u64)>> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut entries = vec![];
    for entry in fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        let is_db = path.extension().is_some_and(|e| e == "db");
        let is_pre_restore = path
            .file_stem()
            .is_some_and(|s| s.to_string_lossy().starts_with("pre-restore-"));
        if !is_db || is_pre_restore {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified: DateTime<Utc> = metadata.modified()?.into();
        entries.push((path, modified, metadata.len()));
    }
    entries.sort_by_key(|e| std::cmp::Reverse(e.1)); // newest first
    Ok(entries)
}

/// Keeps the 14 newest backups outright ("daily"), then walks older ones and keeps one per
/// distinct ISO week for up to 8 more weeks ("weekly"); everything else is deleted.
fn rotate_backups(dir: &Path) -> AppResult<()> {
    let entries = list_backup_files(dir)?;
    let mut keep: HashSet<PathBuf> = entries
        .iter()
        .take(DAILY_KEEP)
        .map(|(p, ..)| p.clone())
        .collect();

    let mut seen_weeks: HashSet<(i32, u32)> = HashSet::new();
    for (path, modified, _) in entries.iter().skip(DAILY_KEEP) {
        let iso = modified.iso_week();
        let key = (iso.year(), iso.week());
        if seen_weeks.contains(&key) {
            continue;
        }
        if seen_weeks.len() >= WEEKLY_KEEP {
            break;
        }
        seen_weeks.insert(key);
        keep.insert(path.clone());
    }

    for (path, ..) in &entries {
        if !keep.contains(path) {
            let _ = fs::remove_file(path); // best-effort: a stale backup lingering isn't fatal
        }
    }
    Ok(())
}

#[tauri::command]
pub fn backup_now(state: State<'_, AppState>) -> AppResult<BackupInfo> {
    let guard = state.library.lock().expect("library mutex poisoned");
    let handle = guard
        .as_ref()
        .ok_or_else(|| AppError::new("no_library", "No library is open"))?;

    let dir = backups_dir(&handle.path);
    fs::create_dir_all(&dir)?;
    let now = Utc::now();
    let file_name = format!("designspace-{}.db", now.format("%Y-%m-%d-%H%M"));
    let dest = dir.join(&file_name);

    handle.conn.execute(
        "VACUUM INTO ?1",
        params![dest.to_string_lossy().into_owned()],
    )?;
    rotate_backups(&dir)?;

    let size_bytes = fs::metadata(&dest)?.len();
    Ok(BackupInfo {
        id: file_name,
        path: dest.to_string_lossy().into_owned(),
        created_at: now.to_rfc3339(),
        size_bytes,
    })
}

#[tauri::command]
pub fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    let guard = state.library.lock().expect("library mutex poisoned");
    let handle = guard
        .as_ref()
        .ok_or_else(|| AppError::new("no_library", "No library is open"))?;
    let entries = list_backup_files(&backups_dir(&handle.path))?;
    Ok(entries
        .into_iter()
        .map(|(path, modified, size_bytes)| BackupInfo {
            id: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            created_at: modified.to_rfc3339(),
            size_bytes,
        })
        .collect())
}

#[tauri::command]
pub fn backup_restore(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let mut guard = state.library.lock().expect("library mutex poisoned");
    let handle = guard
        .as_mut()
        .ok_or_else(|| AppError::new("no_library", "No library is open"))?;

    let dir = backups_dir(&handle.path);
    let backup_path = dir.join(&id);
    if !backup_path.is_file() {
        return Err(AppError::new("not_found", "Backup not found"));
    }

    let db_path = handle.path.join("designspace.db");
    let now = Utc::now();
    let pre_restore = dir.join(format!("pre-restore-{}.db", now.format("%Y-%m-%d-%H%M%S")));

    // Close the live connection before touching the file on disk.
    let closed = std::mem::replace(&mut handle.conn, Connection::open_in_memory()?);
    drop(closed);

    fs::copy(&db_path, &pre_restore)?;
    fs::copy(&backup_path, &db_path)?;

    let new_conn = Connection::open(&db_path)?;
    new_conn.pragma_update(None, "journal_mode", "WAL")?;
    new_conn.pragma_update(None, "foreign_keys", true)?;
    new_conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    handle.conn = new_conn;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn touch(path: &Path, when: SystemTime) {
        fs::write(path, b"fake db bytes").unwrap();
        let file = fs::File::open(path).unwrap();
        file.set_modified(when).unwrap();
    }

    #[test]
    fn rotate_keeps_the_14_newest_outright() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        for i in 0..20 {
            let path = dir.path().join(format!("designspace-{i}.db"));
            touch(&path, now - Duration::from_secs(i as u64 * 3600));
        }
        rotate_backups(dir.path()).unwrap();
        let remaining = list_backup_files(dir.path()).unwrap();
        assert!(remaining.len() >= 14);
        // The 14 newest (i = 0..14) must all survive.
        for i in 0..14 {
            assert!(dir.path().join(format!("designspace-{i}.db")).exists());
        }
    }

    #[test]
    fn rotate_never_touches_pre_restore_backups() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        for i in 0..20 {
            touch(
                &dir.path().join(format!("designspace-{i}.db")),
                now - Duration::from_secs(i as u64 * 86400),
            );
        }
        let pre_restore = dir.path().join("pre-restore-2026-01-01-0000.db");
        touch(&pre_restore, now - Duration::from_secs(999 * 86400));

        rotate_backups(dir.path()).unwrap();
        assert!(pre_restore.exists());
    }

    #[test]
    fn rotate_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        for i in 0..30 {
            touch(
                &dir.path().join(format!("designspace-{i}.db")),
                now - Duration::from_secs(i as u64 * 86400),
            );
        }
        rotate_backups(dir.path()).unwrap();
        let after_first = list_backup_files(dir.path()).unwrap().len();
        rotate_backups(dir.path()).unwrap();
        let after_second = list_backup_files(dir.path()).unwrap().len();
        assert_eq!(after_first, after_second);
    }
}
