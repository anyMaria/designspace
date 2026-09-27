//! The DB bridge commands (§4.4): `db_select`, `db_execute`, `db_batch`. Thin — SQL comes
//! entirely from the frontend's migrator and repositories; Rust never embeds schema knowledge.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use rusqlite::types::{ToSqlOutput, Value as SqlValue};
use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as JsonValue};
use tauri::State;

/// Wraps a JSON value so it can be bound as a SQL parameter.
struct JsonParam(JsonValue);

impl ToSql for JsonParam {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        let value = match &self.0 {
            JsonValue::Null => SqlValue::Null,
            JsonValue::Bool(b) => SqlValue::Integer(i64::from(*b)),
            JsonValue::Number(n) => {
                if let Some(i) = n.as_i64() {
                    SqlValue::Integer(i)
                } else if let Some(f) = n.as_f64() {
                    SqlValue::Real(f)
                } else {
                    return Err(rusqlite::Error::ToSqlConversionFailure(
                        format!("unsupported number: {n}").into(),
                    ));
                }
            }
            JsonValue::String(s) => SqlValue::Text(s.clone()),
            JsonValue::Array(items) => {
                // A JSON array of small integers is treated as a BLOB (used for binary params).
                let bytes: Option<Vec<u8>> = items
                    .iter()
                    .map(|v| v.as_u64().and_then(|n| u8::try_from(n).ok()))
                    .collect();
                match bytes {
                    Some(b) => SqlValue::Blob(b),
                    None => {
                        return Err(rusqlite::Error::ToSqlConversionFailure(
                            "array parameters must be byte arrays".into(),
                        ));
                    }
                }
            }
            JsonValue::Object(_) => {
                return Err(rusqlite::Error::ToSqlConversionFailure(
                    "object parameters are not supported".into(),
                ));
            }
        };
        Ok(ToSqlOutput::Owned(value))
    }
}

fn bind_params(params: &[JsonValue]) -> Vec<JsonParam> {
    params.iter().cloned().map(JsonParam).collect()
}

fn to_sql_refs(params: &[JsonParam]) -> Vec<&dyn ToSql> {
    params.iter().map(|p| p as &dyn ToSql).collect()
}

fn row_to_json(row: &rusqlite::Row) -> rusqlite::Result<Map<String, JsonValue>> {
    let mut map = Map::new();
    for (i, column) in row.as_ref().column_names().iter().enumerate() {
        let value: JsonValue = match row.get_ref(i)? {
            rusqlite::types::ValueRef::Null => JsonValue::Null,
            rusqlite::types::ValueRef::Integer(n) => JsonValue::from(n),
            rusqlite::types::ValueRef::Real(f) => serde_json::Number::from_f64(f)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null),
            rusqlite::types::ValueRef::Text(t) => {
                JsonValue::String(String::from_utf8_lossy(t).into_owned())
            }
            rusqlite::types::ValueRef::Blob(b) => {
                JsonValue::Array(b.iter().map(|byte| JsonValue::from(*byte)).collect())
            }
        };
        map.insert((*column).to_string(), value);
    }
    Ok(map)
}

fn with_connection<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Connection) -> AppResult<T>,
) -> AppResult<T> {
    let guard = state.library.lock().expect("library mutex poisoned");
    let handle = guard
        .as_ref()
        .ok_or_else(|| AppError::new("no_library", "No library is open"))?;
    f(&handle.conn)
}

#[tauri::command]
pub fn db_select(
    state: State<'_, AppState>,
    sql: String,
    params: Option<Vec<JsonValue>>,
) -> AppResult<Vec<Map<String, JsonValue>>> {
    with_connection(&state, |conn| {
        let bound = bind_params(&params.unwrap_or_default());
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(to_sql_refs(&bound).as_slice(), row_to_json)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

#[derive(Serialize)]
pub struct ExecuteResult {
    pub changes: usize,
}

#[tauri::command]
pub fn db_execute(
    state: State<'_, AppState>,
    sql: String,
    params: Option<Vec<JsonValue>>,
) -> AppResult<ExecuteResult> {
    with_connection(&state, |conn| {
        let bound = bind_params(&params.unwrap_or_default());
        let changes = conn.execute(&sql, to_sql_refs(&bound).as_slice())?;
        Ok(ExecuteResult { changes })
    })
}

#[derive(Deserialize)]
pub struct Statement {
    pub sql: String,
    pub params: Option<Vec<JsonValue>>,
}

#[tauri::command]
pub fn db_batch(state: State<'_, AppState>, statements: Vec<Statement>) -> AppResult<()> {
    with_connection(&state, |conn| {
        // rusqlite's Connection is behind `&Connection` here (not `&mut`), but `unchecked_transaction`
        // lets us still run BEGIN/COMMIT/ROLLBACK without needing exclusive access — the AppState
        // mutex already guarantees no concurrent use.
        let tx = conn.unchecked_transaction()?;
        for statement in &statements {
            let bound = bind_params(&statement.params.clone().unwrap_or_default());
            tx.execute(&statement.sql, to_sql_refs(&bound).as_slice())?;
        }
        tx.commit()?;
        Ok(())
    })
}
