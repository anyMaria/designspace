use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct LibraryHandle {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub conn: Connection,
}

/// An in-progress chunked upload (`media_import_begin`/`_chunk`/`_finish`, §4.4), keyed by a
/// token in `AppState::uploads`.
pub struct ChunkedUpload {
    pub name: String,
    pub buffer: Vec<u8>,
}

#[derive(Default)]
pub struct AppState {
    pub library: Mutex<Option<LibraryHandle>>,
    pub uploads: Mutex<HashMap<String, ChunkedUpload>>,
}
