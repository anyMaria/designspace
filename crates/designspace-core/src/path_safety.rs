//! Every file the app touches — `media://` protocol requests, imports, purges — goes through
//! this check first. See docs/IMPLEMENTATION_PLAN.md §4.4 ("Path safety: canonicalize every
//! path and reject anything that escapes its root") and §4.12.

use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PathSafetyError {
    #[error("path escapes its root")]
    Escapes,
    #[error("path does not exist")]
    NotFound,
}

/// Resolves `candidate` against `root` and rejects anything that isn't a real file/directory
/// inside `root` once symlinks are resolved — used to serve `media://` requests. Rejects
/// absolute paths and `..` components before ever touching the filesystem.
pub fn resolve_existing(root: &Path, candidate: &str) -> Result<PathBuf, PathSafetyError> {
    let candidate_path = Path::new(candidate);
    if candidate_path.is_absolute() {
        return Err(PathSafetyError::Escapes);
    }
    if candidate_path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(PathSafetyError::Escapes);
    }

    let root = root.canonicalize().map_err(|_| PathSafetyError::NotFound)?;
    let resolved = root
        .join(candidate_path)
        .canonicalize()
        .map_err(|_| PathSafetyError::NotFound)?;

    if resolved.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(PathSafetyError::Escapes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolves_a_normal_file_inside_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("media/2026/09")).unwrap();
        let file = dir.path().join("media/2026/09/poster-abc123.jpg");
        fs::write(&file, b"fake image bytes").unwrap();

        let resolved = resolve_existing(dir.path(), "media/2026/09/poster-abc123.jpg").unwrap();
        assert_eq!(resolved, file.canonicalize().unwrap());
    }

    #[test]
    fn rejects_parent_dir_traversal() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("media")).unwrap();
        let err = resolve_existing(dir.path(), "media/../../../etc/passwd").unwrap_err();
        assert_eq!(err, PathSafetyError::Escapes);
    }

    #[test]
    fn rejects_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let err = resolve_existing(dir.path(), "/etc/passwd").unwrap_err();
        assert_eq!(err, PathSafetyError::Escapes);
    }

    #[test]
    fn rejects_a_symlink_that_escapes_root() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let secret = outside.path().join("secret.txt");
        fs::write(&secret, b"outside the library").unwrap();

        fs::create_dir_all(dir.path().join("media")).unwrap();
        let link = dir.path().join("media/escape.txt");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        #[cfg(unix)]
        {
            let err = resolve_existing(dir.path(), "media/escape.txt").unwrap_err();
            assert_eq!(err, PathSafetyError::Escapes);
        }
    }

    #[test]
    fn reports_not_found_for_a_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let err = resolve_existing(dir.path(), "media/nope.jpg").unwrap_err();
        assert_eq!(err, PathSafetyError::NotFound);
    }
}
