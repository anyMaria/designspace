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
/// A current desktop browser's user agent: many sites refuse an unknown one and answer without a
/// preview picture (Patch 3 · B3).
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const ACCEPT_HTML: &str =
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
const ACCEPT_LANGUAGE: &str = "en,fr;q=0.8";
/// The smallest apple-touch-icon worth using as a picture.
const MIN_TOUCH_ICON_PX: u32 = 120;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkMeta {
    pub final_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_name: Option<String>,
    pub image_url: Option<String>,
    /// Every picture the page offers, best first. The frontend tries them in order until one
    /// downloads as an image. `image_url` is the first of them.
    pub image_candidates: Vec<String>,
    pub favicon_url: Option<String>,
}

fn client() -> AppResult<Client> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(ACCEPT_HTML),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static(ACCEPT_LANGUAGE),
    );
    Client::builder()
        .default_headers(headers)
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

fn attr_all(doc: &Html, selector: &str, attr_name: &str) -> Vec<String> {
    let Ok(sel) = Selector::parse(selector) else {
        return Vec::new();
    };
    doc.select(&sel)
        .filter_map(|el| el.value().attr(attr_name))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Every `image` URL inside a JSON-LD block: a string, a list of strings, or an object with a
/// `url`. Searches nested objects and `@graph` lists too.
fn json_ld_images(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(image) = map.get("image") {
                collect_image_value(image, out);
            }
            for (key, child) in map {
                if key != "image" {
                    json_ld_images(child, out);
                }
            }
        }
        serde_json::Value::Array(items) => items.iter().for_each(|v| json_ld_images(v, out)),
        _ => {}
    }
}

fn collect_image_value(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::String(s) if !s.trim().is_empty() => out.push(s.trim().to_string()),
        serde_json::Value::Array(items) => items.iter().for_each(|v| collect_image_value(v, out)),
        serde_json::Value::Object(map) => {
            if let Some(url) = map.get("url") {
                collect_image_value(url, out);
            }
        }
        _ => {}
    }
}

/// The largest apple-touch-icon of at least `MIN_TOUCH_ICON_PX`. An icon with no `sizes` counts
/// as 180 px (what iOS assumes for a lone icon).
fn best_touch_icon(doc: &Html) -> Option<String> {
    let sel = Selector::parse(
        r#"link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]"#,
    )
    .ok()?;
    doc.select(&sel)
        .filter_map(|el| {
            let href = el.value().attr("href")?.trim().to_string();
            if href.is_empty() {
                return None;
            }
            let size = el
                .value()
                .attr("sizes")
                .and_then(|s| s.split('x').next())
                .and_then(|w| w.trim().parse::<u32>().ok())
                .unwrap_or(180);
            (size >= MIN_TOUCH_ICON_PX).then_some((size, href))
        })
        .max_by_key(|(size, _)| *size)
        .map(|(_, href)| href)
}

/// Picture candidates in the order the plan gives (Patch 3 · B3), resolved against the page URL
/// and without duplicates.
fn image_candidates(base: &Url, doc: &Html) -> Vec<String> {
    let mut raw: Vec<String> = Vec::new();
    for selector in [
        r#"meta[property="og:image:secure_url"], meta[name="og:image:secure_url"]"#,
        r#"meta[property="og:image"], meta[name="og:image"]"#,
        r#"meta[property="og:image:url"], meta[name="og:image:url"]"#,
        r#"meta[property="twitter:image"], meta[name="twitter:image"]"#,
        r#"meta[property="twitter:image:src"], meta[name="twitter:image:src"]"#,
    ] {
        raw.extend(attr_all(doc, selector, "content"));
    }
    raw.extend(attr_all(doc, r#"link[rel="image_src"]"#, "href"));
    raw.extend(attr_all(doc, r#"meta[itemprop="image"]"#, "content"));
    if let Ok(sel) = Selector::parse(r#"script[type="application/ld+json"]"#) {
        for el in doc.select(&sel) {
            let body: String = el.text().collect();
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(body.trim()) {
                json_ld_images(&value, &mut raw);
            }
        }
    }
    raw.extend(best_touch_icon(doc));

    let mut out: Vec<String> = Vec::new();
    for candidate in raw {
        if let Ok(resolved) = base.join(&candidate) {
            let resolved = resolved.to_string();
            if (resolved.starts_with("http://") || resolved.starts_with("https://"))
                && !out.contains(&resolved)
            {
                out.push(resolved);
            }
        }
    }
    out
}

/// A picture URL that is known without fetching the page: YouTube's thumbnail for a video id.
fn youtube_id(url: &Url) -> Option<String> {
    let host = url
        .host_str()?
        .trim_start_matches("www.")
        .trim_start_matches("m.");
    let id = match host {
        "youtu.be" => url.path_segments()?.next().map(|s| s.to_string()),
        "youtube.com" | "music.youtube.com" | "youtube-nocookie.com" => {
            let mut segments = url.path_segments()?;
            match segments.next() {
                Some("watch") => url
                    .query_pairs()
                    .find(|(k, _)| k == "v")
                    .map(|(_, v)| v.to_string()),
                Some("shorts") | Some("embed") | Some("live") => {
                    segments.next().map(|s| s.to_string())
                }
                _ => None,
            }
        }
        _ => None,
    }?;
    let valid = !id.is_empty()
        && id.len() <= 20
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then_some(id)
}

fn youtube_thumbnail(url: &Url) -> Option<String> {
    youtube_id(url).map(|id| format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"))
}

/// True for `vimeo.com/<digits>` style links (the picture comes from Vimeo's oEmbed answer).
fn is_vimeo_video(url: &Url) -> bool {
    let host = url.host_str().unwrap_or("").trim_start_matches("www.");
    host == "vimeo.com"
        && url
            .path_segments()
            .map(|mut s| s.any(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())))
            .unwrap_or(false)
}

async fn vimeo_thumbnail(url: &Url) -> Option<String> {
    let endpoint = Url::parse_with_params(
        "https://vimeo.com/api/oembed.json",
        &[("url", url.as_str())],
    )
    .ok()?;
    let res = client()
        .ok()?
        .get(endpoint)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let bytes = read_capped(res, MAX_HTML_BYTES).await.ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("thumbnail_url")?.as_str().map(|s| s.to_string())
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
    let mut image_candidates = image_candidates(final_url, &doc);
    if let Some(known) = youtube_thumbnail(final_url) {
        image_candidates.retain(|c| c != &known);
        image_candidates.insert(0, known);
    }
    let image_url = image_candidates.first().cloned();
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
        image_candidates,
        favicon_url,
    }
}

async fn fetch_page(parsed: Url) -> AppResult<(Url, String)> {
    let res = client()?.get(parsed).send().await?.error_for_status()?;
    let final_url = res.url().clone();
    let bytes = read_capped(res, MAX_HTML_BYTES).await?;
    Ok((final_url, String::from_utf8_lossy(&bytes).into_owned()))
}

async fn fetch_link_meta(url: &str) -> AppResult<LinkMeta> {
    let parsed = ensure_http_scheme(url)?;
    let known = youtube_thumbnail(&parsed);
    let page = fetch_page(parsed.clone()).await;
    let mut meta = match page {
        Ok((final_url, html)) => parse_link_meta(&final_url, &html),
        // A YouTube link still gets its picture when the page itself can't be read.
        Err(_) if known.is_some() => parse_link_meta(&parsed, ""),
        Err(err) => return Err(err),
    };
    if is_vimeo_video(&parsed) {
        if let Some(thumb) = vimeo_thumbnail(&parsed).await {
            meta.image_candidates.retain(|c| c != &thumb);
            meta.image_candidates.insert(0, thumb);
            meta.image_url = meta.image_candidates.first().cloned();
        }
    }
    Ok(meta)
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
    fn finds_images_from_name_attributes_in_priority_order_and_decodes_entities() {
        let html = r#"<html><head>
            <meta name="twitter:image" content="//cdn.example.com/tw.jpg">
            <meta name="og:image" content="https://example.com/og.jpg?a=1&amp;b=2">
            <meta property="og:image:secure_url" content="https://example.com/secure.jpg">
        </head></html>"#;
        let base = Url::parse("https://example.com/p").unwrap();
        let meta = parse_link_meta(&base, html);
        assert_eq!(
            meta.image_candidates,
            vec![
                "https://example.com/secure.jpg",
                "https://example.com/og.jpg?a=1&b=2",
                "https://cdn.example.com/tw.jpg",
            ]
        );
        assert_eq!(
            meta.image_url.as_deref(),
            Some("https://example.com/secure.jpg")
        );
    }

    #[test]
    fn finds_images_in_json_ld() {
        let html = r#"<html><head><script type="application/ld+json">
            {"@context":"https://schema.org","@graph":[
              {"@type":"Article","image":{"@type":"ImageObject","url":"/a/hero.jpg"}},
              {"@type":"Thing","image":["https://example.com/b.jpg"]}]}
        </script></head></html>"#;
        let base = Url::parse("https://example.com/p").unwrap();
        let meta = parse_link_meta(&base, html);
        assert_eq!(
            meta.image_candidates,
            vec![
                "https://example.com/a/hero.jpg",
                "https://example.com/b.jpg"
            ]
        );
    }

    #[test]
    fn falls_back_to_the_largest_big_enough_apple_touch_icon() {
        let html = r#"<html><head>
            <link rel="apple-touch-icon" sizes="60x60" href="/i60.png">
            <link rel="apple-touch-icon" sizes="152x152" href="/i152.png">
            <link rel="apple-touch-icon" sizes="180x180" href="/i180.png">
        </head></html>"#;
        let base = Url::parse("https://example.com/").unwrap();
        let meta = parse_link_meta(&base, html);
        assert_eq!(meta.image_candidates, vec!["https://example.com/i180.png"]);
        let small = r#"<html><head><link rel="apple-touch-icon" sizes="57x57" href="/s.png"></head></html>"#;
        assert!(parse_link_meta(&base, small).image_candidates.is_empty());
    }

    #[test]
    fn knows_youtube_thumbnails_without_the_page() {
        for (url, id) in [
            (
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
                "dQw4w9WgXcQ",
            ),
            ("https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/abcDEF_-123", "abcDEF_-123"),
        ] {
            let u = Url::parse(url).unwrap();
            assert_eq!(
                youtube_thumbnail(&u).as_deref(),
                Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg").as_str()),
                "{url}"
            );
        }
        assert!(youtube_thumbnail(&Url::parse("https://www.youtube.com/").unwrap()).is_none());
        assert!(youtube_thumbnail(&Url::parse("https://example.com/watch?v=x").unwrap()).is_none());
    }

    #[test]
    fn recognises_vimeo_video_urls() {
        assert!(is_vimeo_video(
            &Url::parse("https://vimeo.com/123456789").unwrap()
        ));
        assert!(is_vimeo_video(
            &Url::parse("https://www.vimeo.com/channels/staffpicks/123").unwrap()
        ));
        assert!(!is_vimeo_video(
            &Url::parse("https://vimeo.com/about").unwrap()
        ));
        assert!(!is_vimeo_video(
            &Url::parse("https://example.com/123").unwrap()
        ));
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
