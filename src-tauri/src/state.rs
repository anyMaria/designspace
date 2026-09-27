use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct LibraryHandle {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub conn: Connection,
}

#[derive(Default)]
pub struct AppState {
    pub library: Mutex<Option<LibraryHandle>>,
}
