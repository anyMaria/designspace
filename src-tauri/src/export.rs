//! Library export (§5.4, M7): "a JSON file with all metadata (items, terms, boards, placements,
//! frames, connections, filters), optionally zipped with the media." The JSON manifest itself is
//! assembled on the frontend (`src/features/export/exportLibrary.ts`) from ordinary `db.select`
//! queries — no new Rust surface needed for the plain-JSON variant, which reuses
//! `dialogs::dialog_save_file`. This command only exists for the ZIP-with-media variant: only
//! Rust can stream the (potentially gigabytes-large) `media/` directory into an archive without
//! routing those bytes through IPC.

use crate::error::AppResult;
use crate::state::AppState;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    media_root: &Path,
    dir: &Path,
    options: SimpleFileOptions,
) -> AppResult<()> {
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            add_dir_to_zip(zip, media_root, &path, options)?;
            continue;
        }
        let rel = path
            .strip_prefix(media_root)
            .expect("entry is inside media_root by construction");
        let name = format!("media/{}", rel.to_string_lossy().replace('\\', "/"));
        zip.start_file(name, options)?;
        let mut buf = Vec::new();
        File::open(&path)?.read_to_end(&mut buf)?;
        zip.write_all(&buf)?;
    }
    Ok(())
}

/// Opens a native "Save As…" dialog defaulting to `default_name`, then writes a ZIP containing
/// `designspace-export.json` (the manifest the frontend built) plus the whole `media/` directory.
/// Returns `false` (no error) if the owner cancels the dialog, matching `dialog_save_file`.
#[tauri::command]
pub fn export_library_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    manifest_json: String,
    default_name: String,
) -> AppResult<bool> {
    let library_root = {
        let guard = state.library.lock().expect("library mutex poisoned");
        let handle = guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::new("no_library", "No library is open"))?;
        handle.path.clone()
    };

    let path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(file_path) = path else {
        return Ok(false);
    };
    let dest = file_path
        .into_path()
        .map_err(|e| crate::error::AppError::new("path_error", e.to_string()))?;

    let file = File::create(&dest)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("designspace-export.json", options)?;
    zip.write_all(manifest_json.as_bytes())?;

    let media_dir = library_root.join("media");
    if media_dir.is_dir() {
        add_dir_to_zip(&mut zip, &media_dir, &media_dir, options)?;
    }

    zip.finish()?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn zips_json_manifest_and_media_directory() {
        let media_dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(media_dir.path().join("2026/09")).unwrap();
        std::fs::write(
            media_dir.path().join("2026/09/photo.jpg"),
            b"fake jpeg bytes",
        )
        .unwrap();
        std::fs::write(
            media_dir.path().join("2026/09/other.png"),
            b"fake png bytes",
        )
        .unwrap();

        let mut buf = Vec::new();
        {
            let mut zip = ZipWriter::new(Cursor::new(&mut buf));
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("designspace-export.json", options).unwrap();
            zip.write_all(b"{\"items\":[]}").unwrap();
            add_dir_to_zip(&mut zip, media_dir.path(), media_dir.path(), options).unwrap();
            zip.finish().unwrap();
        }

        let mut archive = zip::ZipArchive::new(Cursor::new(&buf)).unwrap();
        assert!(archive.by_name("designspace-export.json").is_ok());
        assert!(archive.by_name("media/2026/09/photo.jpg").is_ok());
        assert!(archive.by_name("media/2026/09/other.png").is_ok());
    }
}
