//! The `media://` protocol (§4.4): serves library originals, cached derivatives
//! to the webview, with Range support (video seeking, PDF streaming), CORS/CORP headers
//! so WebGL textures and `fetch()` work under our COEP policy, and strict path safety.

use crate::state::AppState;
use designspace_core::media_url::{cache_file_name, parse_media_path, MediaRoot};
use designspace_core::path_safety::{resolve_existing, PathSafetyError};
use std::borrow::Cow;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "pdf" => "application/pdf",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "onnx" => "application/octet-stream",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

fn error_response(status: StatusCode) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Cow::Borrowed(&[] as &[u8]))
        .expect("building an error response cannot fail")
}

/// A single `bytes=start-end` range (multi-range requests aren't supported — none of our media
/// clients send them).
struct ByteRange {
    start: u64,
    end: u64,
}

fn parse_range(header_value: &str, file_len: u64) -> Option<ByteRange> {
    let spec = header_value.strip_prefix("bytes=")?;
    let (start_s, end_s) = spec.split_once('-')?;
    if file_len == 0 {
        return None;
    }
    let start: u64 = if start_s.is_empty() {
        0
    } else {
        start_s.parse().ok()?
    };
    let end: u64 = if end_s.is_empty() {
        file_len - 1
    } else {
        end_s.parse().ok()?
    };
    if start > end || end >= file_len {
        return None;
    }
    Some(ByteRange { start, end })
}

fn read_range(path: &Path, range: Option<&ByteRange>) -> std::io::Result<Vec<u8>> {
    let mut file = fs::File::open(path)?;
    match range {
        None => {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            Ok(buf)
        }
        Some(r) => {
            file.seek(SeekFrom::Start(r.start))?;
            let len = (r.end - r.start + 1) as usize;
            let mut buf = vec![0u8; len];
            file.read_exact(&mut buf)?;
            Ok(buf)
        }
    }
}

fn base_dir_for<R: Runtime>(app: &AppHandle<R>, root_kind: MediaRoot) -> Option<PathBuf> {
    match root_kind {
        MediaRoot::Original => {
            let state = app.state::<AppState>();
            let guard = state.library.lock().ok()?;
            guard.as_ref().map(|h| h.path.clone())
        }
        MediaRoot::Cache => {
            let state = app.state::<AppState>();
            let library_id = {
                let guard = state.library.lock().ok()?;
                guard.as_ref().map(|h| h.id.clone())
            }?;
            let dir = app
                .path()
                .app_local_data_dir()
                .ok()?
                .join("cache")
                .join(library_id);
            fs::create_dir_all(&dir).ok()?;
            Some(dir)
        }
    }
}

fn try_handle<R: Runtime>(
    app: &AppHandle<R>,
    request: &Request<Vec<u8>>,
) -> Result<Response<Cow<'static, [u8]>>, StatusCode> {
    let parsed = parse_media_path(request.uri().path()).map_err(|_| StatusCode::NOT_FOUND)?;
    let root_kind = parsed.root;

    let base = base_dir_for(app, root_kind).ok_or(StatusCode::NOT_FOUND)?;
    // Cached derivatives are stored as flat files (`t128/<id>` -> `t128_<id>`), see `cache_put`.
    let rel = match root_kind {
        MediaRoot::Cache => cache_file_name(&parsed.rel),
        _ => parsed.rel,
    };
    let resolved = resolve_existing(&base, &rel).map_err(|e| match e {
        PathSafetyError::Escapes => StatusCode::FORBIDDEN,
        PathSafetyError::NotFound => StatusCode::NOT_FOUND,
    })?;
    if !resolved.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    let metadata = fs::metadata(&resolved).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let file_len = metadata.len();
    let range_header = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| parse_range(v, file_len));

    let body = read_range(&resolved, range_header.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mime = mime_for(&resolved);

    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin");

    if root_kind == MediaRoot::Cache {
        // Cache keys are per item, not per content: a re-made thumbnail must never show stale.
        // The `?v=` in the URL already busts the cache when a thumbnail changes.
        builder = builder.header(header::CACHE_CONTROL, "no-cache");
    }

    let response = if let Some(range) = range_header {
        builder
            .status(StatusCode::PARTIAL_CONTENT)
            .header(
                header::CONTENT_RANGE,
                format!("bytes {}-{}/{}", range.start, range.end, file_len),
            )
            .header(header::CONTENT_LENGTH, body.len().to_string())
            .body(Cow::Owned(body))
    } else {
        builder
            .status(StatusCode::OK)
            .header(header::CONTENT_LENGTH, body.len().to_string())
            .body(Cow::Owned(body))
    };

    response.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_asynchronous_uri_scheme_protocol("media", |ctx, request, responder| {
        let app = ctx.app_handle().clone();
        std::thread::spawn(move || {
            let response = try_handle(&app, &request).unwrap_or_else(|status| {
                log::warn!("media:// {} for {}", status, request.uri().path());
                error_response(status)
            });
            responder.respond(response);
        });
    })
}
