/// SubstrateIndex — OGSE Living Protocol Server
///
/// Builds a per-algorithm Standing (Λ vector) from the seven OGSE substrates:
///   1. TTL ontology declaration (declared)
///   2. Registry JSON generation (generated)
///   3. Receipt crown validation (receipted + receipt_crown_valid)
///   4. Falsification test presence (falsified)
///   5. OCEL admission + fitness (admitted + fitness)
///
/// All IO errors are silently skipped — missing files contribute nothing to Standing.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AlgoEntry {
    pub id: String,
    pub wasm_export: String,
    pub ttl_line: u32,
    pub category: String,
    pub citation: String,
}

#[derive(Debug, Clone)]
pub struct Standing {
    pub declared: bool,
    pub generated: bool,
    pub receipted: bool,
    pub falsified: bool,
    pub admitted: bool,
    pub fitness: f32,
    pub receipt_crown_valid: bool,
    pub registry_export: String,
}

impl Default for Standing {
    fn default() -> Self {
        Standing {
            declared: false,
            generated: false,
            receipted: false,
            falsified: false,
            admitted: false,
            fitness: 0.0,
            receipt_crown_valid: false,
            registry_export: String::new(),
        }
    }
}

#[derive(Debug)]
pub struct SubstrateIndex {
    algorithms: BTreeMap<String, (AlgoEntry, Standing)>,
    workspace_root: PathBuf,
}

// ---------------------------------------------------------------------------
// TTL parser helpers
// ---------------------------------------------------------------------------

fn strip_ttl_string(s: &str) -> String {
    // Remove surrounding quotes and trailing punctuation (;  .)
    let s = s.trim();
    let s = s.trim_start_matches('"');
    let s = s.trim_end_matches([';', '.', ' ', '\t']);
    let s = s.trim_end_matches('"');
    s.to_string()
}

fn parse_algorithms_ttl(path: &Path) -> Vec<AlgoEntry> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };

    let mut entries: Vec<AlgoEntry> = Vec::new();

    // State machine: we collect a "block" per pi:Algo_ subject
    let mut in_block = false;
    let mut block_start_line: u32 = 0;

    // Mutable fields for the current block
    let mut cur_id = String::new();
    let mut cur_export = String::new();
    let mut cur_category = String::new();
    let mut cur_citation = String::new();

    let mut flush_entry = |id: &str,
                           export: &str,
                           category: &str,
                           citation: &str,
                           line: u32,
                           out: &mut Vec<AlgoEntry>| {
        if !id.is_empty() {
            out.push(AlgoEntry {
                id: id.to_string(),
                wasm_export: export.to_string(),
                ttl_line: line,
                category: category.to_string(),
                citation: citation.to_string(),
            });
        }
    };

    for (line_idx, raw) in text.lines().enumerate() {
        let line_no = (line_idx + 1) as u32;
        let trimmed = raw.trim();

        // Detect a new subject block
        if trimmed.starts_with("pi:Algo_") {
            // Flush previous block if any
            if in_block {
                flush_entry(
                    &cur_id,
                    &cur_export,
                    &cur_category,
                    &cur_citation,
                    block_start_line,
                    &mut entries,
                );
            }
            // Start new block — extract id from "pi:Algo_<id>"
            let subject = trimmed.split_whitespace().next().unwrap_or("");
            cur_id = subject.strip_prefix("pi:Algo_").unwrap_or("").to_string();
            cur_export = String::new();
            cur_category = String::new();
            cur_citation = String::new();
            block_start_line = line_no;
            in_block = true;
            continue;
        }

        // Blank line ends the current block
        if trimmed.is_empty() {
            if in_block {
                flush_entry(
                    &cur_id,
                    &cur_export,
                    &cur_category,
                    &cur_citation,
                    block_start_line,
                    &mut entries,
                );
                in_block = false;
                cur_id = String::new();
                cur_export = String::new();
                cur_category = String::new();
                cur_citation = String::new();
            }
            continue;
        }

        if !in_block {
            continue;
        }

        // Inside a block — parse predicate-value pairs
        // We look for lines like:  pi:algorithmId    "alignments" ;
        if let Some(rest) = trimmed.strip_prefix("pi:algorithmId") {
            cur_id = strip_ttl_string(rest.trim());
        } else if let Some(rest) = trimmed.strip_prefix("pi:wasmExport") {
            cur_export = strip_ttl_string(rest.trim());
        } else if let Some(rest) = trimmed.strip_prefix("pi:category") {
            cur_category = strip_ttl_string(rest.trim());
        } else if let Some(rest) = trimmed.strip_prefix("pi:citation") {
            cur_citation = strip_ttl_string(rest.trim());
        }
    }

    // Flush final block
    if in_block {
        flush_entry(
            &cur_id,
            &cur_export,
            &cur_category,
            &cur_citation,
            block_start_line,
            &mut entries,
        );
    }

    entries
}

// ---------------------------------------------------------------------------
// Registry JSON helpers
// ---------------------------------------------------------------------------

fn parse_registry_json(path: &Path) -> BTreeMap<String, String> {
    // Returns map of algo_id -> wasm_export from registry.json.
    // Supports array of {id, wasm_export} objects or top-level object keyed by id.
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return BTreeMap::new(),
    };
    let v: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return BTreeMap::new(),
    };

    let mut out = BTreeMap::new();

    if let Some(arr) = v.as_array() {
        for entry in arr {
            let id = entry
                .get("id")
                .or_else(|| entry.get("algorithm_id"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let export = entry
                .get("wasm_export")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if !id.is_empty() {
                out.insert(id, export);
            }
        }
    } else if let Some(obj) = v.as_object() {
        for (k, val) in obj {
            let export = val
                .get("wasm_export")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            out.insert(k.clone(), export);
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Receipt crown validation
// ---------------------------------------------------------------------------

const HEX64_LEN: usize = 64;
const HEX16_LEN: usize = 16;

fn is_hex(s: &str, expected_len: usize) -> bool {
    s.len() == expected_len && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Returns (receipted, crown_valid) for the given algo id.
fn check_receipt(receipts_dir: &Path, algo_id: &str) -> (bool, bool) {
    let file_name = format!("pi-{}-latest.json", algo_id);
    let path = receipts_dir.join(file_name);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return (false, false),
    };
    let v: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return (true, false), // file exists but malformed
    };

    let algorithm = v.get("algorithm").and_then(|x| x.as_str()).unwrap_or("");
    let input_hash = v.get("input_hash").and_then(|x| x.as_str()).unwrap_or("");
    let output_hash = v.get("output_hash").and_then(|x| x.as_str()).unwrap_or("");
    let run_id = v.get("run_id").and_then(|x| x.as_str()).unwrap_or("");
    let replay_pointer = v
        .get("replay_pointer")
        .and_then(|x| x.as_str())
        .unwrap_or("");

    let crown_valid = !algorithm.is_empty()
        && is_hex(input_hash, HEX64_LEN)
        && is_hex(output_hash, HEX64_LEN)
        && !run_id.is_empty()
        && is_hex(replay_pointer, HEX16_LEN);

    (true, crown_valid)
}

/// Scan .wasm4pm/receipts/ for all pi-*-latest.json files and return a map
/// of algo_id -> (receipted, crown_valid).
fn scan_receipts(receipts_dir: &Path) -> BTreeMap<String, (bool, bool)> {
    let mut out = BTreeMap::new();
    let dir = match std::fs::read_dir(receipts_dir) {
        Ok(d) => d,
        Err(_) => return out,
    };
    for entry in dir.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().into_owned();
        if name_str.starts_with("pi-") && name_str.ends_with("-latest.json") {
            // Extract algo_id between "pi-" and "-latest.json"
            let inner = &name_str["pi-".len()..name_str.len() - "-latest.json".len()];
            let (r, c) = check_receipt(receipts_dir, inner);
            out.insert(inner.to_string(), (r, c));
        }
    }
    out
}

// ---------------------------------------------------------------------------
// OCEL report helpers
// ---------------------------------------------------------------------------

fn parse_ocel_report(path: &Path) -> (bool, f32) {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return (false, 0.0),
    };
    let v: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return (false, 0.0),
    };
    let admitted = v.get("admitted").and_then(|x| x.as_bool()).unwrap_or(false);
    let fitness = v
        .get("fitness")
        .and_then(|x| x.as_f64())
        .map(|f| f as f32)
        .unwrap_or(0.0);
    (admitted, fitness)
}

fn scan_ocel_reports(ocel_pi_dir: &Path) -> BTreeMap<String, (bool, f32)> {
    let mut out = BTreeMap::new();
    let dir = match std::fs::read_dir(ocel_pi_dir) {
        Ok(d) => d,
        Err(_) => return out,
    };
    for entry in dir.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().into_owned();
        if name_str.ends_with(".json") {
            let algo_id = name_str.trim_end_matches(".json").to_string();
            let (admitted, fitness) = parse_ocel_report(&entry.path());
            out.insert(algo_id, (admitted, fitness));
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Falsification test grep
// ---------------------------------------------------------------------------

fn scan_falsification_tests(test_file: &Path) -> std::collections::HashSet<String> {
    let mut ids = std::collections::HashSet::new();
    let text = match std::fs::read_to_string(test_file) {
        Ok(t) => t,
        Err(_) => return ids,
    };
    // Look for lines like: fn test_<algo_id>( or async fn test_<algo_id>(
    for line in text.lines() {
        let trimmed = line.trim();
        // Skip comment lines
        if trimmed.starts_with("//") || trimmed.starts_with("///") {
            continue;
        }
        // Find "fn test_" pattern
        let fn_marker = if let Some(pos) = trimmed.find("fn test_") {
            &trimmed[pos + "fn ".len()..]
        } else {
            continue;
        };
        // fn_marker now starts at "test_..."
        let fn_name = fn_marker.split('(').next().unwrap_or("").trim();
        if let Some(algo_part) = fn_name.strip_prefix("test_") {
            if !algo_part.is_empty() {
                ids.insert(algo_part.to_string());
                // Also insert hyphen variant for matching
                ids.insert(algo_part.replace('_', "-"));
            }
        }
    }
    ids
}

fn algo_matches_falsified(id: &str, falsified_ids: &std::collections::HashSet<String>) -> bool {
    falsified_ids.contains(id)
        || falsified_ids.contains(&id.replace('-', "_"))
        || falsified_ids.contains(&id.replace('_', "-"))
}

// ---------------------------------------------------------------------------
// SubstrateIndex implementation
// ---------------------------------------------------------------------------

impl SubstrateIndex {
    pub fn build(workspace_root: &Path) -> Self {
        let workspace_root = workspace_root.to_path_buf();

        // --- Substrate 1: TTL declarations ---
        let ttl_path = workspace_root
            .join("ggen")
            .join("ontology")
            .join("algorithms.ttl");
        let ttl_entries = parse_algorithms_ttl(&ttl_path);

        // --- Substrate 2: Registry JSON ---
        let registry_path = workspace_root
            .join("wasm4pm")
            .join("algorithms")
            .join("registry.json");
        let registry_map = parse_registry_json(&registry_path);

        // --- Substrate 3: Receipt crowns ---
        let receipts_dir = workspace_root.join(".wasm4pm").join("receipts");
        let receipt_map = scan_receipts(&receipts_dir);

        // --- Substrate 4: OCEL reports ---
        let ocel_pi_dir = workspace_root.join("ocel").join("reports").join("pi");
        let ocel_map = scan_ocel_reports(&ocel_pi_dir);

        // --- Substrate 5: Falsification tests ---
        let test_file = workspace_root
            .join("wasm4pm")
            .join("tests")
            .join("algorithm_paper_grounded.rs");
        let falsified_ids = scan_falsification_tests(&test_file);

        // --- Assemble index ---
        let mut algorithms: BTreeMap<String, (AlgoEntry, Standing)> = BTreeMap::new();

        // Seed from TTL (declared algorithms)
        for entry in ttl_entries {
            let id = entry.id.clone();

            let generated = registry_map.contains_key(&id);

            let (receipted, receipt_crown_valid) =
                receipt_map.get(&id).copied().unwrap_or((false, false));

            let (admitted, fitness) = ocel_map.get(&id).copied().unwrap_or((false, 0.0));

            let falsified = algo_matches_falsified(&id, &falsified_ids);

            let registry_export = registry_map.get(&id).cloned().unwrap_or_default();

            let standing = Standing {
                declared: true,
                generated,
                receipted,
                falsified,
                admitted,
                fitness,
                receipt_crown_valid,
                registry_export,
            };

            algorithms.insert(id, (entry, standing));
        }

        // Include registry entries not in TTL (generated but not declared in TTL)
        for (id, export) in &registry_map {
            if !algorithms.contains_key(id) {
                let entry = AlgoEntry {
                    id: id.clone(),
                    wasm_export: export.clone(),
                    ttl_line: 0,
                    category: String::new(),
                    citation: String::new(),
                };

                let (receipted, receipt_crown_valid) =
                    receipt_map.get(id).copied().unwrap_or((false, false));

                let (admitted, fitness) = ocel_map.get(id).copied().unwrap_or((false, 0.0));

                let falsified = algo_matches_falsified(id, &falsified_ids);

                let standing = Standing {
                    declared: false,
                    generated: true,
                    receipted,
                    falsified,
                    admitted,
                    fitness,
                    receipt_crown_valid,
                    registry_export: export.clone(),
                };

                algorithms.insert(id.clone(), (entry, standing));
            }
        }

        SubstrateIndex {
            algorithms,
            workspace_root,
        }
    }

    pub fn get(&self, id: &str) -> Option<&(AlgoEntry, Standing)> {
        self.algorithms.get(id)
    }

    /// Return the workspace root path that was supplied to `build`.
    pub fn workspace_root(&self) -> &std::path::Path {
        &self.workspace_root
    }

    /// Test-only constructor — builds an index from a pre-populated BTreeMap.
    #[cfg(test)]
    pub fn from_entries(entries: BTreeMap<String, (AlgoEntry, Standing)>) -> Self {
        SubstrateIndex {
            algorithms: entries,
            workspace_root: PathBuf::new(),
        }
    }

    pub fn all(&self) -> impl Iterator<Item = (&str, &AlgoEntry, &Standing)> {
        self.algorithms
            .iter()
            .map(|(id, (entry, standing))| (id.as_str(), entry, standing))
    }

    pub fn count(&self) -> usize {
        self.algorithms.len()
    }

    /// Returns (algo_id, ttl_export, registry_export) triples where the
    /// wasm_export declared in the TTL differs from the registry value.
    pub fn drift_pairs(&self) -> Vec<(String, String, String)> {
        let registry_path = self
            .workspace_root
            .join("wasm4pm")
            .join("algorithms")
            .join("registry.json");
        let registry_map = parse_registry_json(&registry_path);

        let mut out = Vec::new();

        for (id, (entry, standing)) in &self.algorithms {
            if !standing.declared {
                continue; // no TTL export to compare
            }
            if let Some(reg_export) = registry_map.get(id) {
                if entry.wasm_export != *reg_export {
                    out.push((id.clone(), entry.wasm_export.clone(), reg_export.clone()));
                }
            }
        }

        out
    }

    /// Returns ids + entries for all algorithms where `admitted == true`.
    pub fn admitted_algorithms(&self) -> Vec<(&str, &AlgoEntry, &Standing)> {
        self.algorithms
            .iter()
            .filter(|(_, (_, s))| s.admitted)
            .map(|(id, (entry, standing))| (id.as_str(), entry, standing))
            .collect()
    }

    /// Returns a map of category -> list of (id, AlgoEntry, Standing).
    pub fn algorithms_by_category(&self) -> BTreeMap<&str, Vec<(&str, &AlgoEntry, &Standing)>> {
        let mut out: BTreeMap<&str, Vec<(&str, &AlgoEntry, &Standing)>> = BTreeMap::new();
        for (id, (entry, standing)) in &self.algorithms {
            out.entry(entry.category.as_str())
                .or_default()
                .push((id.as_str(), entry, standing));
        }
        out
    }
}
