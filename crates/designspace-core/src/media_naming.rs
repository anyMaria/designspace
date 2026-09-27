//! Builds the relative path for an imported original: `media/YYYY/MM/slug-id.ext` (§5.1).

use crate::slug::slugify;

/// `id_suffix` is the last 6 characters of the item's ULID (§5.1); `original_name` is the
/// source file name, used only for its stem (slugified) and extension.
pub fn media_rel_path(year: i32, month: u32, id_suffix: &str, original_name: &str) -> String {
    let (stem, ext) = split_stem_ext(original_name);
    let slug = slugify(stem);
    match ext {
        Some(ext) => format!(
            "media/{year:04}/{month:02}/{slug}-{id_suffix}.{}",
            ext.to_ascii_lowercase()
        ),
        None => format!("media/{year:04}/{month:02}/{slug}-{id_suffix}"),
    }
}

fn split_stem_ext(name: &str) -> (&str, Option<&str>) {
    match name.rsplit_once('.') {
        // A name starting with '.' and no other dot (e.g. ".gitignore") has no extension.
        Some((stem, ext)) if !stem.is_empty() => (stem, Some(ext)),
        _ => (name, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_expected_layout() {
        assert_eq!(
            media_rel_path(2026, 9, "3f9k2a", "Bauhaus Poster.jpg"),
            "media/2026/09/bauhaus-poster-3f9k2a.jpg"
        );
    }

    #[test]
    fn lowercases_the_extension() {
        assert_eq!(
            media_rel_path(2026, 1, "abc123", "Photo.JPG"),
            "media/2026/01/photo-abc123.jpg"
        );
    }

    #[test]
    fn handles_a_name_with_no_extension() {
        assert_eq!(
            media_rel_path(2026, 12, "abc123", "README"),
            "media/2026/12/readme-abc123"
        );
    }

    #[test]
    fn handles_a_dotfile_as_having_no_extension() {
        assert_eq!(
            media_rel_path(2026, 12, "abc123", ".gitignore"),
            "media/2026/12/gitignore-abc123"
        );
    }
}
