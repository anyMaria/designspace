//! Parses `media://` request paths (§4.4). Tauri's `convertFileSrc` runs `encodeURIComponent` over
//! the whole argument, so on Windows `original/media/2026/10/x.jpg` arrives as
//! `/original%2Fmedia%2F2026%2F10%2Fx.jpg`: decode first, then split. Path safety (`..`, absolute
//! paths, symlinks) stays in `path_safety::resolve_existing`, which must run on the decoded `rel`.

use percent_encoding::percent_decode_str;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaRoot {
    Original,
    Cache,
}

#[derive(Debug, PartialEq, Eq)]
pub struct MediaRequest {
    pub root: MediaRoot,
    pub rel: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MediaUrlError {
    #[error("the path is not valid UTF-8 once decoded")]
    InvalidUtf8,
    #[error("the path has no root/relative part")]
    BadPath,
    #[error("unknown media root")]
    UnknownRoot,
}

pub fn parse_media_path(raw_path: &str) -> Result<MediaRequest, MediaUrlError> {
    let decoded = percent_decode_str(raw_path)
        .decode_utf8()
        .map_err(|_| MediaUrlError::InvalidUtf8)?;
    let trimmed = decoded.trim_start_matches('/');
    let (root, rel) = trimmed.split_once('/').ok_or(MediaUrlError::BadPath)?;
    if rel.is_empty() {
        return Err(MediaUrlError::BadPath);
    }
    let root = match root {
        "original" => MediaRoot::Original,
        "cache" => MediaRoot::Cache,
        _ => return Err(MediaUrlError::UnknownRoot),
    };
    Ok(MediaRequest {
        root,
        rel: rel.to_string(),
    })
}

/// Cache keys are opaque strings (often containing `/`, e.g. `t128/<itemId>`); they're stored as a
/// single flat file name. `cache_put`/`cache_has`/`cache_delete` and the `media://cache/` handler
/// must all use this same function.
pub fn cache_file_name(key: &str) -> String {
    key.replace(['/', '\\'], "_").replace("..", "_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_encoded_slashes_for_originals() {
        let r = parse_media_path("/original%2Fmedia%2F2026%2F10%2Fposter-abc123.jpg").unwrap();
        assert_eq!(r.root, MediaRoot::Original);
        assert_eq!(r.rel, "media/2026/10/poster-abc123.jpg");
    }

    #[test]
    fn decodes_encoded_slashes_for_cache_keys() {
        let r = parse_media_path("/cache%2Ft128%2F01M41C21BPKAHJE5SESAWJQV80").unwrap();
        assert_eq!(r.root, MediaRoot::Cache);
        assert_eq!(cache_file_name(&r.rel), "t128_01M41C21BPKAHJE5SESAWJQV80");
    }

    #[test]
    fn still_accepts_unencoded_paths() {
        let r = parse_media_path("/original/media/2026/10/x.jpg").unwrap();
        assert_eq!(r.root, MediaRoot::Original);
        assert_eq!(r.rel, "media/2026/10/x.jpg");
    }

    #[test]
    fn decodes_accents_and_spaces() {
        let r = parse_media_path("/original%2Fmedia%2Fr%C3%AAve%20bleu.jpg").unwrap();
        assert_eq!(r.rel, "media/rêve bleu.jpg");
    }

    #[test]
    fn rejects_unknown_roots_and_empty_paths() {
        assert_eq!(
            parse_media_path("/secret%2Fx").unwrap_err(),
            MediaUrlError::UnknownRoot
        );
        assert_eq!(
            parse_media_path("/original").unwrap_err(),
            MediaUrlError::BadPath
        );
        assert_eq!(
            parse_media_path("/original/").unwrap_err(),
            MediaUrlError::BadPath
        );
    }

    #[test]
    fn encoded_parent_dirs_survive_decoding_so_path_safety_can_reject_them() {
        let r = parse_media_path("/original%2F..%2F..%2Fsecret.txt").unwrap();
        assert_eq!(r.rel, "../../secret.txt");
    }

    #[test]
    fn rejects_invalid_utf8() {
        assert_eq!(
            parse_media_path("/original%2F%FF").unwrap_err(),
            MediaUrlError::InvalidUtf8
        );
    }

    #[test]
    fn cache_file_name_flattens_and_neutralises_dots() {
        assert_eq!(cache_file_name("t512/abc"), "t512_abc");
        assert_eq!(cache_file_name("../x"), "__x");
    }
}
