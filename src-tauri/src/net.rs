//! Link metadata + cover-image download (§2.3, §4.4). The only place this app ever reaches the
//! internet — the webview's strict CSP means it can't do this itself; these are plain `#[tauri::
//! command]`s the frontend calls after an explicit owner action (pasting/dropping a URL), and
//! only when Offline mode is off (checked in TS before invoking — see `useSettingsStore`).

use crate::error::{AppError, AppResult};
use crate::media::{import_bytes, with_library, ImportResult};
use crate::state::AppState;
use futures_util::StreamExt;
use reqwest::redirect::Policy;
use reqwest::{Client, Response, Url};
use scraper::{Html, Selector};
use serde::Serialize;
use std::time::Duration;
use tauri::State;

const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_REDIRECTS: usize = 5;
const MAX_HTML_BYTES: usize = 5 * 1024 * 1024; // 5 MB, per §4.4's network limits
const MAX_IMAGE_BYTES: usize = 50 * 1024 * 1024; // 50 MB
const USER_AGENT: &str = concat!("Designspace/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkMeta {
    pub final_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_name: Option<String>,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
}

fn client() -> AppResult<Client> {
    Client::builder()
        .redirect(Policy::limited(MAX_REDIRECTS))
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(AppError::from)
}

fn ensure_http_scheme(url: &str) -> AppResult<Url> {
    let parsed = Url::parse(url).map_err(|e| AppError::new("invalid_url", e.to_string()))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::new(
            "unsupported_scheme",
            format!("Only http(s) URLs are supported, got {}", parsed.scheme()),
        ));
    }
    Ok(parsed)
}

/// Reads a response body up to `cap` bytes, erroring rather than silently truncating — a
/// malicious/misbehaving server sending an oversized body is a fetch failure, not a "here's the
/// first N MB" partial result.
async fn read_capped(response: Response, cap: usize) -> AppResult<Vec<u8>> {
    if let Some(len) = response.content_length() {
        if len as usize > cap {
            return Err(AppError::new(
                "response_too_large",
                format!("Response is {len} bytes, over the {cap}-byte limit"),
            ));
        }
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        bytes.extend_from_slice(&chunk);
        if bytes.len() > cap {
            return Err(AppError::new(
                "response_too_large",
                format!("Response exceeded the {cap}-byte limit"),
            ));
        }
    }
    Ok(bytes)
}

fn attr(doc: &Html, selector: &str, attr_name: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    doc.select(&sel)
        .next()
        .and_then(|el| el.value().attr(attr_name))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn text(doc: &Html, selector: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    doc.select(&sel)
        .next()
        .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
        .filter(|s| !s.is_empty())
}

fn resolve(base: &Url, maybe_relative: Option<String>) -> Option<String> {
    let raw = maybe_relative?;
    base.join(&raw).ok().map(|u| u.to_string()).or(Some(raw))
}

fn parse_link_meta(final_url: &Url, html: &str) -> LinkMeta {
    let doc = Html::parse_document(html);

    let title = attr(&doc, r#"meta[property="og:title"]"#, "content")
        .or_else(|| attr(&doc, r#"meta[name="twitter:title"]"#, "content"))
        .or_else(|| text(&doc, "title"));
    let description = attr(&doc, r#"meta[property="og:description"]"#, "content")
        .or_else(|| attr(&doc, r#"meta[name="description"]"#, "content"));
    let site_name = attr(&doc, r#"meta[property="og:site_name"]"#, "content")
        .or_else(|| final_url.host_str().map(|h| h.to_string()));
    let image_url = resolve(
        final_url,
        attr(&doc, r#"meta[property="og:image"]"#, "content")
            .or_else(|| attr(&doc, r#"meta[name="twitter:image"]"#, "content")),
    );
    let favicon_url = resolve(
        final_url,
        attr(&doc, r#"link[rel="icon"]"#, "href")
            .or_else(|| attr(&doc, r#"link[rel="shortcut icon"]"#, "href")),
    )
    .or_else(|| final_url.join("/favicon.ico").ok().map(|u| u.to_string()));

    LinkMeta {
        final_url: final_url.to_string(),
        title,
        description,
        site_name,
        image_url,
        favicon_url,
    }
}

async fn fetch_link_meta(url: &str) -> AppResult<LinkMeta> {
    let parsed = ensure_http_scheme(url)?;
    let res = client()?.get(parsed).send().await?.error_for_status()?;
    let final_url = res.url().clone();
    let bytes = read_capped(res, MAX_HTML_BYTES).await?;
    let html = String::from_utf8_lossy(&bytes);
    Ok(parse_link_meta(&final_url, &html))
}

#[tauri::command]
pub async fn net_link_meta(url: String) -> AppResult<LinkMeta> {
    fetch_link_meta(&url).await
}

fn guess_image_extension(content_type: Option<&str>, url: &Url) -> String {
    let from_type = content_type.and_then(|ct| match ct.split(';').next().unwrap_or(ct).trim() {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        "image/svg+xml" => Some("svg"),
        _ => None,
    });
    if let Some(ext) = from_type {
        return ext.to_string();
    }
    url.path_segments()
        .and_then(|mut segs| segs.next_back())
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, ext)| ext)
        .filter(|ext| !ext.is_empty() && ext.len() <= 5)
        .unwrap_or("jpg")
        .to_string()
}

async fn download_image(url: &str) -> AppResult<(String, Vec<u8>)> {
    let parsed = ensure_http_scheme(url)?;
    let res = client()?
        .get(parsed.clone())
        .send()
        .await?
        .error_for_status()?;
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    if let Some(ct) = &content_type {
        if !ct.starts_with("image/") {
            return Err(AppError::new(
                "not_an_image",
                format!("{url} responded with content-type {ct}, not an image"),
            ));
        }
    }
    let ext = guess_image_extension(content_type.as_deref(), &parsed);
    let bytes = read_capped(res, MAX_IMAGE_BYTES).await?;
    let name = format!("link-cover.{ext}");
    Ok((name, bytes))
}

#[tauri::command]
pub async fn net_download_image(
    state: State<'_, AppState>,
    url: String,
) -> AppResult<ImportResult> {
    let (name, bytes) = download_image(&url).await?;
    with_library(&state, |conn, root| import_bytes(conn, root, &name, &bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_graph_tags_and_resolves_relative_urls() {
        let html = r#"
            <html><head>
                <title>Fallback Title</title>
                <meta property="og:title" content="A Great Article">
                <meta property="og:description" content="It's about things.">
                <meta property="og:site_name" content="Example News">
                <meta property="og:image" content="/img/cover.jpg">
                <link rel="icon" href="/favicon-32.png">
            </head><body></body></html>
        "#;
        let base = Url::parse("https://example.com/articles/great").unwrap();
        let meta = parse_link_meta(&base, html);

        assert_eq!(meta.title.as_deref(), Some("A Great Article"));
        assert_eq!(meta.description.as_deref(), Some("It's about things."));
        assert_eq!(meta.site_name.as_deref(), Some("Example News"));
        assert_eq!(
            meta.image_url.as_deref(),
            Some("https://example.com/img/cover.jpg")
        );
        assert_eq!(
            meta.favicon_url.as_deref(),
            Some("https://example.com/favicon-32.png")
        );
    }

    #[test]
    fn falls_back_to_the_page_title_and_domain_when_no_og_tags_exist() {
        let html = "<html><head><title>Plain Page</title></head><body></body></html>";
        let base = Url::parse("https://plain.example").unwrap();
        let meta = parse_link_meta(&base, html);

        assert_eq!(meta.title.as_deref(), Some("Plain Page"));
        assert_eq!(meta.site_name.as_deref(), Some("plain.example"));
        assert_eq!(meta.image_url, None);
        // No <link rel="icon">, so falls back to the conventional /favicon.ico path.
        assert_eq!(
            meta.favicon_url.as_deref(),
            Some("https://plain.example/favicon.ico")
        );
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(ensure_http_scheme("ftp://example.com/file").is_err());
        assert!(ensure_http_scheme("javascript:alert(1)").is_err());
        assert!(ensure_http_scheme("https://example.com").is_ok());
    }

    #[test]
    fn guesses_image_extension_from_content_type_first_then_the_url() {
        let url = Url::parse("https://example.com/assets/cover.png?v=2").unwrap();
        assert_eq!(guess_image_extension(Some("image/webp"), &url), "webp");
        assert_eq!(guess_image_extension(None, &url), "png");
        let no_ext = Url::parse("https://example.com/cover").unwrap();
        assert_eq!(guess_image_extension(None, &no_ext), "jpg");
    }

    // Real network I/O against a local loopback server — exercises the actual fetch, redirect
    // and byte-cap paths (not just the pure HTML-parsing helpers above). Runs on Tokio's
    // multi-thread runtime rather than Tauri's, since these tests don't need a live AppHandle.
    #[tokio::test(flavor = "multi_thread")]
    async fn fetches_and_parses_a_real_http_response() {
        let mock = httpmock::MockServer::start_async().await;
        mock.mock(|when, then| {
            when.method(httpmock::Method::GET).path("/page");
            then.status(200)
                .header("content-type", "text/html; charset=utf-8")
                .body(
                    r#"<html><head>
                        <meta property="og:title" content="Mocked Page">
                        <meta property="og:image" content="/cover.png">
                    </head></html>"#,
                );
        });

        let meta = fetch_link_meta(&mock.url("/page")).await.unwrap();
        assert_eq!(meta.title.as_deref(), Some("Mocked Page"));
        assert!(meta.image_url.as_deref().unwrap().ends_with("/cover.png"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn downloads_an_image_and_names_it_from_the_content_type() {
        let mock = httpmock::MockServer::start_async().await;
        mock.mock(|when, then| {
            when.method(httpmock::Method::GET).path("/cover.bin");
            then.status(200)
                .header("content-type", "image/webp")
                .body(vec![0u8, 1, 2, 3]);
        });

        let (name, bytes) = download_image(&mock.url("/cover.bin")).await.unwrap();
        assert_eq!(name, "link-cover.webp");
        assert_eq!(bytes, vec![0u8, 1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn rejects_a_non_image_response_when_downloading_a_cover() {
        let mock = httpmock::MockServer::start_async().await;
        mock.mock(|when, then| {
            when.method(httpmock::Method::GET).path("/not-an-image");
            then.status(200)
                .header("content-type", "text/html")
                .body("<html></html>");
        });

        let result = download_image(&mock.url("/not-an-image")).await;
        assert!(result.is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn follows_redirects_up_to_the_limit() {
        let mock = httpmock::MockServer::start_async().await;
        mock.mock(|when, then| {
            when.method(httpmock::Method::GET).path("/start");
            then.status(302).header("location", "/final");
        });
        mock.mock(|when, then| {
            when.method(httpmock::Method::GET).path("/final");
            then.status(200)
                .header("content-type", "text/html")
                .body("<html><head><title>Landed</title></head></html>");
        });

        let meta = fetch_link_meta(&mock.url("/start")).await.unwrap();
        assert_eq!(meta.title.as_deref(), Some("Landed"));
        assert!(meta.final_url.ends_with("/final"));
    }
}
