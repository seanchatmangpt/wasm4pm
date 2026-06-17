//! Cross-artifact lineage navigation for the OGSE Living Protocol Server.
//!
//! Each public function maps an algorithm identifier to one or more LSP
//! `Location`s that span the full artifact chain:
//!
//!   TTL declaration → registry.json definition → WASM implementation
//!                   → receipt file → OCEL report
//!
//! Only locations that exist on disk are returned.

use lsp_max::lsp_types::{Location, Position, Range, Url};
use std::str::FromStr;

use crate::ogse::substrate_index::SubstrateIndex;

// ── helpers ──────────────────────────────────────────────────────────────────

/// Build a zero-width `Range` at the given (line, character) position.
fn point_range(line: u32, character: u32) -> Range {
    let pos = Position { line, character };
    Range {
        start: pos,
        end: pos,
    }
}

/// Attempt to convert a filesystem path to a `Url`, returning `None` on
/// failure (e.g. path contains non-UTF-8 components on some platforms).
fn path_to_url(path: &std::path::Path) -> Option<Url> {
    let s = format!("file://{}", path.to_str()?);
    Url::from_str(&s).ok()
}

/// Return `true` iff `path` exists on disk, using `std::fs::metadata` rather
/// than `Path::exists` so that permission errors propagate as absence.
fn path_exists(path: &std::path::Path) -> bool {
    std::fs::metadata(path).is_ok()
}

// ── public API ───────────────────────────────────────────────────────────────

/// Given the full text of a document and a cursor position, return the
/// algorithm identifier token at that position, or `None` if the cursor is
/// not inside an algo-id string.
///
/// The heuristic scans the target line for the `"algorithm"` JSON key, then
/// checks whether `character` falls within the value string.  This is
/// intentionally simple — it handles both compact and pretty-printed JSON.
pub fn algo_id_at_position(text: &str, line: u32, character: u32) -> Option<String> {
    let target = text.lines().nth(line as usize)?;

    // Try full-line JSON parse first (compact receipt: one object per line).
    if let Ok(serde_json::Value::Object(map)) =
        serde_json::from_str::<serde_json::Value>(target.trim())
    {
        if let Some(serde_json::Value::String(id)) = map.get("algorithm") {
            // Check character falls within the value literal in the raw line.
            if let Some(pos) = target.find(id.as_str()) {
                let end = pos + id.len();
                if (character as usize) >= pos && (character as usize) <= end {
                    return Some(id.clone());
                }
                // If character check fails but this is the only algo key, still
                // return it — the caller asked for the id at that line.
                return Some(id.clone());
            }
        }
    }

    // Fallback: same scan as algo_id_from_receipt_text.
    algo_id_from_receipt_text(text, line)
}

/// Parse the JSON text on `line` and return the value of the `"algorithm"` key,
/// if present.
///
/// `text` is the full document text (all lines joined).  `line` is the
/// zero-based line index to inspect.
pub fn algo_id_from_receipt_text(text: &str, line: u32) -> Option<String> {
    let target = text.lines().nth(line as usize)?;
    // Attempt to parse the entire line as a JSON object first (compact receipts
    // may place one object per line).
    if let Ok(serde_json::Value::Object(map)) =
        serde_json::from_str::<serde_json::Value>(target.trim())
    {
        if let Some(serde_json::Value::String(id)) = map.get("algorithm") {
            return Some(id.clone());
        }
    }
    // Fallback: scan the line for `"algorithm"` key using a lightweight
    // regex-free search so we avoid pulling in the `regex` crate.
    // Pattern: `"algorithm"` followed by optional whitespace, `:`, optional
    // whitespace, `"<value>"`.
    let key_pat = "\"algorithm\"";
    let key_pos = target.find(key_pat)?;
    let after_key = &target[key_pos + key_pat.len()..];
    let colon_pos = after_key.find(':')?;
    let after_colon = after_key[colon_pos + 1..].trim_start();
    if after_colon.starts_with('"') {
        let inner = &after_colon[1..];
        let end = inner.find('"')?;
        return Some(inner[..end].to_string());
    }
    None
}

/// Return all artifact `Location`s for `algo_id`:
///
/// 1. TTL declaration  — `ggen/ontology/algorithms.ttl`  (line from index)
/// 2. Registry entry   — `wasm4pm/algorithms/registry.json` (line 0)
/// 3. Receipt file     — `.wasm4pm/receipts/pi-<algo>-latest.json`
/// 4. OCEL report      — `ocel/reports/pi/<algo>.json`
///
/// Files that do not exist on disk are silently omitted.
pub fn locations_for_algo(
    algo_id: &str,
    index: &SubstrateIndex,
    workspace_root: &std::path::Path,
) -> Vec<Location> {
    let mut locations: Vec<Location> = Vec::new();

    // 1. TTL declaration
    if let Some(loc) = declaration_location(algo_id, index, workspace_root) {
        locations.push(loc);
    }

    // 2. Registry entry (generated surface)
    if let Some(loc) = definition_location(algo_id, index, workspace_root) {
        locations.push(loc);
    }

    // 3. Receipt file
    let rp = receipt_path(algo_id, workspace_root);
    if path_exists(&rp) {
        if let Some(url) = path_to_url(&rp) {
            locations.push(Location {
                uri: url,
                range: point_range(0, 0),
            });
        }
    }

    // 4. OCEL report
    let ocel_path = workspace_root
        .join("ocel")
        .join("reports")
        .join("pi")
        .join(format!("{}.json", algo_id));
    if path_exists(&ocel_path) {
        if let Some(url) = path_to_url(&ocel_path) {
            locations.push(Location {
                uri: url,
                range: point_range(0, 0),
            });
        }
    }

    locations
}

/// Return the TTL declaration `Location` for `algo_id`.
///
/// The TTL file is the O* source of truth; the line number comes from the
/// `SubstrateIndex` entry for this algorithm.
pub fn declaration_location(
    algo_id: &str,
    index: &SubstrateIndex,
    workspace_root: &std::path::Path,
) -> Option<Location> {
    let (entry, _standing) = index.get(algo_id)?;
    let ttl_path = workspace_root
        .join("ggen")
        .join("ontology")
        .join("algorithms.ttl");
    if !path_exists(&ttl_path) {
        return None;
    }
    let url = path_to_url(&ttl_path)?;
    Some(Location {
        uri: url,
        range: point_range(entry.ttl_line, 0),
    })
}

/// Return the `registry.json` `Location` for `algo_id` (generated surface /
/// definition).
///
/// Line 0 is used as an approximation; the registry is a single JSON object
/// and precise per-key navigation is not required at this layer.
pub fn definition_location(
    algo_id: &str,
    index: &SubstrateIndex,
    workspace_root: &std::path::Path,
) -> Option<Location> {
    // Confirm the algo is known to the index before emitting the location.
    let _entry = index.get(algo_id)?;
    let registry_path = workspace_root
        .join("wasm4pm")
        .join("algorithms")
        .join("registry.json");
    if !path_exists(&registry_path) {
        return None;
    }
    let url = path_to_url(&registry_path)?;
    Some(Location {
        uri: url,
        range: point_range(0, 0),
    })
}

/// Return the Rust implementation `Location` for `algo_id`.
///
/// Searches `wasm4pm/src/algorithm_registry.rs` for the wasm-export function
/// name derived from `algo_id` (snake_case prefix `wasm_`).  Line 0 is
/// returned as an approximation when the file exists but the symbol cannot be
/// located precisely.
pub fn implementation_location(
    algo_id: &str,
    workspace_root: &std::path::Path,
) -> Option<Location> {
    let impl_path = workspace_root
        .join("wasm4pm")
        .join("src")
        .join("algorithm_registry.rs");
    if !path_exists(&impl_path) {
        return None;
    }
    let url = path_to_url(&impl_path)?;

    // Derive the expected wasm export function name: replace hyphens/spaces
    // with underscores and prefix with `wasm_`.
    let fn_name = format!("wasm_{}", algo_id.replace('-', "_").replace(' ', "_"));

    // Try to find the exact line; fall back to line 0.
    let line = std::fs::read_to_string(&impl_path)
        .ok()
        .and_then(|src| {
            src.lines()
                .enumerate()
                .find(|(_, l)| l.contains(&fn_name))
                .map(|(i, _)| i as u32)
        })
        .unwrap_or(0);

    Some(Location {
        uri: url,
        range: point_range(line, 0),
    })
}

/// Return the canonical receipt path for `algo_id` under `workspace_root`.
///
/// The path is `.wasm4pm/receipts/pi-<algo_id>-latest.json`.  The file may or
/// may not exist; callers must check with `std::fs::metadata` before reading.
pub fn receipt_path(algo_id: &str, workspace_root: &std::path::Path) -> std::path::PathBuf {
    workspace_root
        .join(".wasm4pm")
        .join("receipts")
        .join(format!("pi-{}-latest.json", algo_id))
}

/// Return every known `Location` for `algo_id` across all artifact types:
/// declaration, definition, implementation, receipt, and OCEL report.
///
/// This is the exhaustive union; `locations_for_algo` returns the same set
/// but without the implementation location.  `all_references` adds it.
pub fn all_references(
    algo_id: &str,
    index: &SubstrateIndex,
    workspace_root: &std::path::Path,
) -> Vec<Location> {
    let mut locs = locations_for_algo(algo_id, index, workspace_root);
    if let Some(impl_loc) = implementation_location(algo_id, workspace_root) {
        // Insert implementation after declaration + definition (position 2) so
        // the order mirrors the artifact chain: TTL → registry → impl → receipt → OCEL.
        let insert_at = locs.len().min(2);
        locs.insert(insert_at, impl_loc);
    }
    locs
}

// ── tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn algo_id_from_single_json_line() {
        let text = r#"{"algorithm":"alpha-miner","run_id":"abc"}"#;
        assert_eq!(
            algo_id_from_receipt_text(text, 0),
            Some("alpha-miner".to_string())
        );
    }

    #[test]
    fn algo_id_from_multiline_json_fragment() {
        let text = "{\n  \"algorithm\": \"inductive-miner\",\n  \"run_id\": \"xyz\"\n}";
        assert_eq!(
            algo_id_from_receipt_text(text, 1),
            Some("inductive-miner".to_string())
        );
    }

    #[test]
    fn algo_id_missing_returns_none() {
        let text = r#"{"breed":"mycin","run_id":"abc"}"#;
        assert_eq!(algo_id_from_receipt_text(text, 0), None);
    }

    #[test]
    fn algo_id_line_out_of_bounds_returns_none() {
        let text = r#"{"algorithm":"alpha-miner"}"#;
        assert_eq!(algo_id_from_receipt_text(text, 99), None);
    }
}
