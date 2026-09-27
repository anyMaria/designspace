//! SHA-256 hashing for exact-duplicate detection (§2.3, `items.file_hash`).

use sha2::{Digest, Sha256};

/// Lowercase hex SHA-256 digest of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_known_digest_of_abc() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn matches_the_known_digest_of_the_empty_input() {
        let digest = sha256_hex(b"");
        assert_eq!(digest.len(), 64);
        assert_eq!(
            digest,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn is_deterministic() {
        let bytes = b"the same bytes twice";
        assert_eq!(sha256_hex(bytes), sha256_hex(bytes));
    }

    #[test]
    fn differs_for_different_input() {
        assert_ne!(sha256_hex(b"a"), sha256_hex(b"b"));
    }
}
