//! `embeddings_put`/`embeddings_load` (§4.4, §4.10) — CLIP vectors for items, one per
//! `(item_id, model)` in the `embeddings` table (`src/db/migrations/001_init.sql`).
//!
//! The plan calls for "binary IPC, so vectors never go through JSON": a full library's worth of
//! vectors (10,000 × 512 floats ≈ 20 MB) as a JSON array of numbers would be several times that
//! in transit and slow to parse. Tauri 2's raw-request-body IPC path would avoid even the base64
//! overhead, but its exact JS-side surface (header-carrying raw requests, alongside the
//! `model`/`itemIds` metadata this command also needs) isn't something this sandbox can exercise
//! against a real WebView2 host to be sure it's wired correctly — see DECISIONS.md. Base64-over-
//! JSON is the documented middle ground: a single string field, ~33% bigger than raw bytes rather
//! than the 4-8x a JSON number array would cost, using only APIs already exercised elsewhere in
//! this app (`invoke` with plain JSON args).

use crate::error::{AppError, AppResult};
use crate::media::with_library;
use crate::state::AppState;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

const BYTES_PER_FLOAT: usize = 4;

fn put_embeddings(
    conn: &Connection,
    model: &str,
    item_ids: &[String],
    dims: u32,
    vectors_b64: &str,
) -> AppResult<()> {
    let bytes = STANDARD
        .decode(vectors_b64.as_bytes())
        .map_err(|e| AppError::new("bad_base64", e.to_string()))?;
    let dims = dims as usize;
    let expected = item_ids.len() * dims * BYTES_PER_FLOAT;
    if bytes.len() != expected {
        return Err(AppError::new(
            "bad_embeddings_payload",
            format!(
                "expected {expected} bytes for {} item(s) at {dims} dims, got {}",
                item_ids.len(),
                bytes.len()
            ),
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    for (i, item_id) in item_ids.iter().enumerate() {
        let start = i * dims * BYTES_PER_FLOAT;
        let vector = &bytes[start..start + dims * BYTES_PER_FLOAT];
        conn.execute(
            "INSERT INTO embeddings (item_id, model, vector, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(item_id, model) DO UPDATE SET vector = excluded.vector, created_at = excluded.created_at",
            params![item_id, model, vector, now],
        )?;
    }
    Ok(())
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingsLoadResult {
    pub item_ids: Vec<String>,
    pub dims: u32,
    pub vectors_b64: String,
}

fn load_embeddings(conn: &Connection, model: &str) -> AppResult<EmbeddingsLoadResult> {
    let mut stmt =
        conn.prepare("SELECT item_id, vector FROM embeddings WHERE model = ?1 ORDER BY item_id")?;
    let rows = stmt.query_map(params![model], |row| {
        let item_id: String = row.get(0)?;
        let vector: Vec<u8> = row.get(1)?;
        Ok((item_id, vector))
    })?;

    let mut item_ids = Vec::new();
    let mut all_bytes: Vec<u8> = Vec::new();
    let mut dims = 0usize;
    for row in rows {
        let (item_id, vector) = row?;
        if dims == 0 {
            dims = vector.len() / BYTES_PER_FLOAT;
        } else if vector.len() != dims * BYTES_PER_FLOAT {
            return Err(AppError::new(
                "inconsistent_embedding_dims",
                format!("item {item_id} has a vector of a different length than the rest"),
            ));
        }
        item_ids.push(item_id);
        all_bytes.extend_from_slice(&vector);
    }

    Ok(EmbeddingsLoadResult {
        item_ids,
        dims: dims as u32,
        vectors_b64: STANDARD.encode(&all_bytes),
    })
}

#[tauri::command]
pub fn embeddings_put(
    state: State<'_, AppState>,
    model: String,
    item_ids: Vec<String>,
    dims: u32,
    vectors_b64: String,
) -> AppResult<()> {
    with_library(&state, |conn, _root| {
        put_embeddings(conn, &model, &item_ids, dims, &vectors_b64)
    })
}

#[tauri::command]
pub fn embeddings_load(
    state: State<'_, AppState>,
    model: String,
) -> AppResult<EmbeddingsLoadResult> {
    with_library(&state, |conn, _root| load_embeddings(conn, &model))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE items (id TEXT PRIMARY KEY);
             CREATE TABLE embeddings (
               item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
               model TEXT NOT NULL,
               vector BLOB NOT NULL,
               created_at TEXT NOT NULL,
               PRIMARY KEY (item_id, model)
             );
             INSERT INTO items (id) VALUES ('a'), ('b');",
        )
        .unwrap();
        conn
    }

    fn pack(vectors: &[[f32; 4]]) -> String {
        let mut bytes = Vec::new();
        for v in vectors {
            for f in v {
                bytes.extend_from_slice(&f.to_le_bytes());
            }
        }
        STANDARD.encode(&bytes)
    }

    #[test]
    fn put_then_load_round_trips_vectors_in_item_id_order() {
        let conn = setup();
        let item_ids = vec!["b".to_string(), "a".to_string()];
        let vectors_b64 = pack(&[[5.0, 6.0, 7.0, 8.0], [1.0, 2.0, 3.0, 4.0]]);

        put_embeddings(&conn, "clip", &item_ids, 4, &vectors_b64).unwrap();
        let loaded = load_embeddings(&conn, "clip").unwrap();

        assert_eq!(loaded.item_ids, vec!["a", "b"]);
        assert_eq!(loaded.dims, 4);
        let bytes = STANDARD.decode(&loaded.vectors_b64).unwrap();
        let a_first_float = f32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let b_first_float = f32::from_le_bytes(bytes[16..20].try_into().unwrap());
        assert_eq!(a_first_float, 1.0);
        assert_eq!(b_first_float, 5.0);
    }

    #[test]
    fn upsert_replaces_an_existing_vector() {
        let conn = setup();
        let item_ids = vec!["a".to_string()];
        put_embeddings(&conn, "clip", &item_ids, 4, &pack(&[[0.0, 0.0, 0.0, 0.0]])).unwrap();
        put_embeddings(&conn, "clip", &item_ids, 4, &pack(&[[9.0, 9.0, 9.0, 9.0]])).unwrap();

        let loaded = load_embeddings(&conn, "clip").unwrap();
        assert_eq!(loaded.item_ids, vec!["a"]);
        let bytes = STANDARD.decode(&loaded.vectors_b64).unwrap();
        assert_eq!(f32::from_le_bytes(bytes[0..4].try_into().unwrap()), 9.0);
    }

    #[test]
    fn a_mismatched_payload_length_is_rejected() {
        let conn = setup();
        let item_ids = vec!["a".to_string(), "b".to_string()];
        let err = put_embeddings(&conn, "clip", &item_ids, 4, &pack(&[[1.0, 2.0, 3.0, 4.0]]))
            .unwrap_err();
        assert_eq!(err.code, "bad_embeddings_payload");
    }

    #[test]
    fn different_models_for_the_same_item_are_independent() {
        let conn = setup();
        put_embeddings(
            &conn,
            "clip-vit-b32",
            &["a".to_string()],
            4,
            &pack(&[[1.0, 0.0, 0.0, 0.0]]),
        )
        .unwrap();
        put_embeddings(
            &conn,
            "clip-mobile",
            &["a".to_string()],
            4,
            &pack(&[[0.0, 1.0, 0.0, 0.0]]),
        )
        .unwrap();

        let vit = load_embeddings(&conn, "clip-vit-b32").unwrap();
        let mobile = load_embeddings(&conn, "clip-mobile").unwrap();
        assert_eq!(vit.item_ids, vec!["a"]);
        assert_eq!(mobile.item_ids, vec!["a"]);
        assert_ne!(vit.vectors_b64, mobile.vectors_b64);
    }

    #[test]
    fn loading_an_unknown_model_returns_an_empty_result() {
        let conn = setup();
        let loaded = load_embeddings(&conn, "nonexistent").unwrap();
        assert!(loaded.item_ids.is_empty());
        assert_eq!(loaded.dims, 0);
    }
}
