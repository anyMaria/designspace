//! Pure Rust logic for Designspace, with no Tauri dependency, so it can be unit-tested without
//! a webview. `src-tauri` wires these into commands and the `media://` protocol — see
//! docs/IMPLEMENTATION_PLAN.md §4.4.

pub mod hash;
pub mod media_naming;
pub mod path_safety;
pub mod slug;
