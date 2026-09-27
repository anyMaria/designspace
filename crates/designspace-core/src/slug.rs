//! Turns an arbitrary file name into a filesystem/URL-safe slug for media file names
//! (`slug-id.ext`, §5.1).

/// Lowercase ASCII alphanumerics, with every run of anything else collapsed to a single `-`.
/// Never empty and never starts/ends with `-`.
pub fn slugify(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut pending_dash = false;

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(ch.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }

    if out.is_empty() {
        "file".to_string()
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lowercases_and_dashes_punctuation() {
        assert_eq!(slugify("Bauhaus Poster (final)"), "bauhaus-poster-final");
    }

    #[test]
    fn collapses_repeated_separators() {
        assert_eq!(slugify("a   b---c"), "a-b-c");
    }

    #[test]
    fn trims_leading_and_trailing_separators() {
        assert_eq!(
            slugify("  -leading and trailing-  "),
            "leading-and-trailing"
        );
    }

    #[test]
    fn falls_back_to_file_for_an_all_punctuation_name() {
        assert_eq!(slugify("★★★"), "file");
        assert_eq!(slugify(""), "file");
    }

    #[test]
    fn keeps_unicode_letters_out_but_does_not_panic() {
        // Non-ASCII letters are dropped, not kept mangled — good enough for a file-name slug.
        assert_eq!(slugify("Rêveur café"), "r-veur-caf");
    }
}
