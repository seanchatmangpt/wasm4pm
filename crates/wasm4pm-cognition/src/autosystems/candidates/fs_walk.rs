//! Filesystem-walking candidate discovery (native only).
//!
//! Scans a directory recursively for `*.candidate.json` manifest fragments
//! and merges them into a single [`CandidateManifest`]. Filename pattern is
//! validated by [`regex::Regex`] so misnamed files are skipped predictably.

#![cfg(not(target_arch = "wasm32"))]

use crate::autosystems::candidates::{CandidateDiscovery, CandidateManifest};
use once_cell::sync::Lazy;
use regex::Regex;
use std::path::{Path, PathBuf};

static FRAGMENT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-zA-Z0-9_\-]+\.candidate\.json$").expect("valid regex"));

/// Walks a directory tree to assemble candidates from `*.candidate.json` files.
#[derive(Debug, Clone)]
pub struct FilesystemDiscovery {
    /// Root path to scan.
    pub root: PathBuf,
    /// Maximum walk depth.
    pub max_depth: usize,
}

impl FilesystemDiscovery {
    /// Construct a new discovery rooted at `root` with default depth 8.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_depth: 8,
        }
    }

    fn walk(&self, path: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<(), String> {
        if depth > self.max_depth {
            return Ok(());
        }
        let read = std::fs::read_dir(path)
            .map_err(|e| format!("read_dir {}: {}", path.display(), e))?;
        for entry in read {
            let entry = entry.map_err(|e| format!("dir entry: {}", e))?;
            let p = entry.path();
            let ftype = entry.file_type().map_err(|e| format!("file_type: {}", e))?;
            if ftype.is_dir() {
                self.walk(&p, depth + 1, out)?;
            } else if ftype.is_file() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if FRAGMENT_RE.is_match(name) {
                        out.push(p);
                    }
                }
            }
        }
        Ok(())
    }
}

impl CandidateDiscovery for FilesystemDiscovery {
    fn discover(&self) -> Result<CandidateManifest, String> {
        let mut paths = Vec::new();
        self.walk(&self.root, 0, &mut paths)?;
        paths.sort();

        let mut merged = CandidateManifest::default();
        merged.version = "1".into();
        for p in paths {
            let body = std::fs::read_to_string(&p)
                .map_err(|e| format!("read {}: {}", p.display(), e))?;
            let mut m: CandidateManifest = serde_json::from_str(&body)
                .map_err(|e| format!("parse {}: {}", p.display(), e))?;
            for c in &mut m.candidates {
                if c.provenance.is_none() {
                    c.provenance = Some(p.display().to_string());
                }
            }
            merged.dimensions.extend(m.dimensions.into_iter());
            merged.candidates.extend(m.candidates.into_iter());
        }
        merged.validate()?;
        Ok(merged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fragment_regex_matches_expected() {
        assert!(FRAGMENT_RE.is_match("alpha.candidate.json"));
        assert!(FRAGMENT_RE.is_match("a-b_c.candidate.json"));
        assert!(!FRAGMENT_RE.is_match("alpha.json"));
        assert!(!FRAGMENT_RE.is_match("alpha.candidate.yaml"));
    }

    #[test]
    fn empty_dir_yields_empty_manifest() {
        let dir = std::env::temp_dir().join(format!("w4pm-fs-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let d = FilesystemDiscovery::new(&dir);
        let m = d.discover().expect("ok");
        assert!(m.candidates.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
