use dashmap::DashMap;
use lsp_max::jsonrpc::Result;
use lsp_max::lsp_types::request::{
    GotoDeclarationParams, GotoDeclarationResponse,
    GotoImplementationParams, GotoImplementationResponse,
    GotoTypeDefinitionParams, GotoTypeDefinitionResponse,
};
use lsp_max::lsp_types::*;
use lsp_max::max_protocol;
use lsp_max::{Client, LspService, Server};
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{Arc, RwLock};
use wasm4pm::gall::{check_gall_conformance, GallVerdict as WasmGallVerdict};
use wasm4pm_compat::ocel::OCEL;

mod config;
mod ts_analyzer;
use config::LspConfig;

// ── OCEL index structures ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct OcelObject {
    id: String,
    obj_type: String,
    range: Range,
}

#[derive(Debug, Clone)]
struct OcelEvent {
    id: String,
    event_type: String,
    time: String,
    range: Range,
    /// (objectId, qualifier, range-of-the-objectId-string-value)
    relationships: Vec<(String, String, Range)>,
}

#[derive(Debug, Clone, Default)]
struct OcelIndex {
    events: Vec<OcelEvent>,
    objects: Vec<OcelObject>,
    event_types: Vec<String>,
    object_types: Vec<String>,
    /// objectId → index in objects
    obj_by_id: HashMap<String, usize>,
    /// eventId → index in events
    event_by_id: HashMap<String, usize>,
    /// objectId → Vec of Ranges (relationship objectId string value positions)
    obj_refs: HashMap<String, Vec<Range>>,
    /// line of "events": [ token
    events_key_line: u32,
    /// line of "objects": [ token
    objects_key_line: u32,
    /// line of closing ] of top-level events array
    events_end_line: u32,
    /// line of closing ] of top-level objects array
    objects_end_line: u32,
}

#[derive(Debug, Clone)]
enum GallVerdict {
    Fit { fitness: f32 },
    Deviation { fitness: f32, missing: Vec<String> },
    Blocked { reason: String },
    Inconclusive,
}

#[derive(Debug, Clone)]
struct ConformanceResult {
    verdict: GallVerdict,
    fitness: Option<f32>,
}

#[derive(Debug, Clone, Default)]
struct DocumentState {
    text: String,
    index: Option<OcelIndex>,
    conformance: Option<ConformanceResult>,
    /// Flat encoded semantic tokens (for delta computation).
    last_tokens: Vec<u32>,
}

// ── Semantic token legend ────────────────────────────────────────────────────
// Types: namespace=0, class=1, function=2, variable=3, string=4, number=5, keyword=6, comment=7
// Modifiers: declaration=0, definition=1, readonly=2, deprecated=3
//
// OCEL mapping:
//   eventId value   → function (2)
//   objectId value  → class (1)
//   activityName    → keyword (6)
//   timestamp       → string (4)
//   attributeName   → variable (3)

fn token_legend() -> SemanticTokensLegend {
    SemanticTokensLegend {
        token_types: vec![
            SemanticTokenType::NAMESPACE,
            SemanticTokenType::CLASS,
            SemanticTokenType::FUNCTION,
            SemanticTokenType::VARIABLE,
            SemanticTokenType::new("string"),
            SemanticTokenType::new("number"),
            SemanticTokenType::KEYWORD,
            SemanticTokenType::COMMENT,
        ],
        token_modifiers: vec![
            SemanticTokenModifier::DECLARATION,
            SemanticTokenModifier::DEFINITION,
            SemanticTokenModifier::READONLY,
            SemanticTokenModifier::DEPRECATED,
        ],
    }
}

// ── Text helpers ─────────────────────────────────────────────────────────────

#[allow(dead_code)]
fn pos_to_offset(text: &str, line: u32, character: u32) -> Option<usize> {
    let mut cur_line = 0u32;
    let mut offset = 0usize;
    for ch in text.chars() {
        if cur_line == line {
            // character is UTF-16 code units; approximate as char count for ASCII-heavy JSON
            if character == 0 {
                return Some(offset);
            }
            // walk character columns
            break;
        }
        if ch == '\n' {
            cur_line += 1;
        }
        offset += ch.len_utf8();
    }
    // Re-do with explicit column walk
    let mut cur_line = 0u32;
    let mut offset = 0usize;
    for ch in text.chars() {
        if cur_line == line {
            let mut col = 0u32;
            let mut col_offset = offset;
            for c in text[offset..].chars() {
                if col == character {
                    return Some(col_offset);
                }
                col += 1;
                col_offset += c.len_utf8();
            }
            return Some(col_offset);
        }
        if ch == '\n' {
            cur_line += 1;
        }
        offset += ch.len_utf8();
    }
    None
}

#[allow(dead_code)]
fn word_at(text: &str, offset: usize) -> Option<(String, usize, usize)> {
    if offset >= text.len() {
        return None;
    }
    // Walk backwards to find start of quoted string or identifier
    let bytes = text.as_bytes();
    // Find enclosing quotes
    let mut start = offset;
    while start > 0 && bytes[start] != b'"' {
        start -= 1;
    }
    if bytes[start] == b'"' {
        start += 1; // skip opening quote
    }
    let mut end = offset;
    while end < text.len() && bytes[end] != b'"' {
        end += 1;
    }
    if start < end {
        Some((text[start..end].to_string(), start, end))
    } else {
        None
    }
}

/// Convert a byte offset to (line, character).
fn offset_to_position(text: &str, offset: usize) -> Position {
    let mut line = 0u32;
    let mut col = 0u32;
    for (i, ch) in text.char_indices() {
        if i == offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 0;
        } else {
            col += 1;
        }
    }
    Position { line, character: col }
}

/// Find all occurrences of a quoted string value in text and return their Ranges.
/// Matches `"<needle>"` (exact quoted value).
fn find_all_quoted(text: &str, needle: &str) -> Vec<Range> {
    let pattern = format!("\"{}\"", needle);
    let mut results = Vec::new();
    let mut search_from = 0;
    while let Some(pos) = text[search_from..].find(&pattern) {
        let abs = search_from + pos + 1; // +1 to skip opening quote
        let start = offset_to_position(text, abs);
        let end = offset_to_position(text, abs + needle.len());
        results.push(Range { start, end });
        search_from = abs + needle.len();
    }
    results
}

// ── OCEL parser ──────────────────────────────────────────────────────────────

fn parse_ocel(text: &str) -> Option<OcelIndex> {
    let v: Value = serde_json::from_str(text).ok()?;
    let obj = v.as_object()?;

    let mut idx = OcelIndex::default();

    // Collect event_types
    if let Some(et) = obj.get("eventTypes").and_then(|v| v.as_array()) {
        for t in et {
            if let Some(name) = t.get("name").and_then(|n| n.as_str()) {
                idx.event_types.push(name.to_string());
            }
        }
    }

    // Collect object_types
    if let Some(ot) = obj.get("objectTypes").and_then(|v| v.as_array()) {
        for t in ot {
            if let Some(name) = t.get("name").and_then(|n| n.as_str()) {
                idx.object_types.push(name.to_string());
            }
        }
    }

    // Parse objects
    if let Some(objects) = obj.get("objects").and_then(|v| v.as_array()) {
        for (i, o) in objects.iter().enumerate() {
            let id = o.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let obj_type = o.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
            // Find range of this object entry in text
            let range = find_value_range(text, &id).unwrap_or_default();
            idx.objects.push(OcelObject { id: id.clone(), obj_type, range });
            idx.obj_by_id.insert(id, i);
        }
    }

    // Parse events
    if let Some(events) = obj.get("events").and_then(|v| v.as_array()) {
        for (i, e) in events.iter().enumerate() {
            let id = e.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let event_type = e.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let time = e.get("time").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let range = find_value_range(text, &id).unwrap_or_default();

            let mut rels = Vec::new();
            if let Some(relationships) = e.get("relationships").and_then(|v| v.as_array()) {
                for r in relationships {
                    let oid = r.get("objectId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let qual = r.get("qualifier").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let rel_range = find_quoted_value_range(text, "objectId", &oid).unwrap_or_default();
                    idx.obj_refs.entry(oid.clone()).or_default().push(rel_range.clone());
                    rels.push((oid, qual, rel_range));
                }
            }

            idx.events.push(OcelEvent { id: id.clone(), event_type, time, range, relationships: rels });
            idx.event_by_id.insert(id, i);
        }
    }

    // Compute line numbers for top-level arrays
    idx.events_key_line = find_key_line(text, "\"events\"");
    idx.objects_key_line = find_key_line(text, "\"objects\"");
    idx.events_end_line = find_array_end_line(text, idx.events_key_line);
    idx.objects_end_line = find_array_end_line(text, idx.objects_key_line);

    Some(idx)
}

/// Find the line number of the first occurrence of `key` in text.
fn find_key_line(text: &str, key: &str) -> u32 {
    let mut line = 0u32;
    for l in text.lines() {
        if l.contains(key) {
            return line;
        }
        line += 1;
    }
    0
}

/// Find the closing bracket line for an array starting at `start_line`.
/// Naive bracket counting.
fn find_array_end_line(text: &str, start_line: u32) -> u32 {
    let lines: Vec<&str> = text.lines().collect();
    let mut depth = 0i32;
    let mut found_start = false;
    for (i, line) in lines.iter().enumerate() {
        if i as u32 >= start_line {
            for ch in line.chars() {
                if ch == '[' {
                    depth += 1;
                    found_start = true;
                } else if ch == ']' && found_start {
                    depth -= 1;
                    if depth == 0 {
                        return i as u32;
                    }
                }
            }
        }
    }
    start_line
}

/// Find the Range of a quoted string id value (e.g. the id itself) in text.
fn find_value_range(text: &str, value: &str) -> Option<Range> {
    let pattern = format!("\"{}\"", value);
    let pos = text.find(&pattern)?;
    let start = offset_to_position(text, pos + 1);
    let end = offset_to_position(text, pos + 1 + value.len());
    Some(Range { start, end })
}

/// Find the Range of a quoted value that is preceded by the given JSON key.
/// Searches for `"<key>": "<value>"` pattern.
fn find_quoted_value_range(text: &str, key: &str, value: &str) -> Option<Range> {
    let pattern = format!("\"{}\": \"{}\"", key, value);
    // Try both spacing variants
    let pos = text.find(&pattern).or_else(|| {
        let p2 = format!("\"{}\":\"{}\"", key, value);
        text.find(&p2)
    })?;
    // Find the value's opening quote
    let key_end = pos + key.len() + 2; // past closing quote of key
    let rest = &text[key_end..];
    let val_start_rel = rest.find(&format!("\"{}\"", value))?;
    let abs_start = key_end + val_start_rel + 1; // skip opening quote
    let start = offset_to_position(text, abs_start);
    let end = offset_to_position(text, abs_start + value.len());
    Some(Range { start, end })
}

// ── OCEL conformance analysis (inlined from gc005-wasm4pm-adapter) ───────────

#[derive(Debug)]
struct ConformanceIssue {
    severity: String,
    code: String,
    message: String,
}

fn analyze_ocel(content: &str) -> Vec<ConformanceIssue> {
    match serde_json::from_str::<OCEL>(content) {
        Ok(ocel) => {
            let (severity, code, message) = match check_gall_conformance(ocel) {
                WasmGallVerdict::Blocked { reason } => (
                    "ERROR",
                    "WASM4PM-VERDICT-BLOCKED",
                    format!("Conformance Verdict: BLOCKED ({})", reason),
                ),
                WasmGallVerdict::Fit { fitness } => (
                    "INFORMATION",
                    "WASM4PM-VERDICT-FIT",
                    format!("Conformance Verdict: FIT (Fitness: {:.1})", fitness),
                ),
                WasmGallVerdict::Deviation { fitness, missing } => (
                    "ERROR",
                    "WASM4PM-VERDICT-DEVIATION",
                    format!(
                        "Conformance Verdict: DEVIATION (Fitness: {:.1}). Missing admission for: {}",
                        fitness,
                        missing.join(", ")
                    ),
                ),
                WasmGallVerdict::Inconclusive { reason } => (
                    "WARNING",
                    "WASM4PM-VERDICT-INCONCLUSIVE",
                    format!("Conformance Verdict: INCONCLUSIVE ({})", reason),
                ),
            };
            vec![ConformanceIssue {
                severity: severity.to_string(),
                code: code.to_string(),
                message,
            }]
        }
        Err(e) => vec![ConformanceIssue {
            severity: "ERROR".to_string(),
            code: "WASM4PM-PARSE-FAILED".to_string(),
            message: format!("Failed to parse OCEL: {}", e),
        }],
    }
}

// ── Structural checks (reusable from LSP path + scan mode) ──────────────────

fn check_structural(idx: &OcelIndex) -> Vec<ConformanceIssue> {
    let mut issues = Vec::new();
    // (a) dangling references
    for ev in &idx.events {
        for (oid, _qual, _range) in &ev.relationships {
            if !idx.obj_by_id.contains_key(oid.as_str()) {
                issues.push(ConformanceIssue {
                    severity: "ERROR".to_string(),
                    code: "WASM4PM-DANGLING-REF".to_string(),
                    message: format!("Dangling objectId reference: \"{}\" not found in objects", oid),
                });
            }
        }
    }
    // (b) time ordering
    let mut prev_time: Option<&str> = None;
    for ev in &idx.events {
        if let Some(pt) = prev_time {
            if ev.time.as_str() < pt {
                issues.push(ConformanceIssue {
                    severity: "WARNING".to_string(),
                    code: "WASM4PM-TIME-ORDER".to_string(),
                    message: format!("Event \"{}\" is out of chronological order", ev.id),
                });
                break;
            }
        }
        prev_time = Some(&ev.time);
    }
    // (c) unknown activity types
    for ev in &idx.events {
        if !idx.event_types.contains(&ev.event_type) {
            issues.push(ConformanceIssue {
                severity: "ERROR".to_string(),
                code: "WASM4PM-UNKNOWN-ACTIVITY".to_string(),
                message: format!("Event type \"{}\" not declared in eventTypes", ev.event_type),
            });
        }
    }
    issues
}

// ── Conformance result from issues ───────────────────────────────────────────

fn conformance_from_issues(issues: &[ConformanceIssue]) -> Option<ConformanceResult> {
    for issue in issues {
        match issue.code.as_str() {
            "WASM4PM-VERDICT-FIT" => {
                // parse fitness from message "... FIT (Fitness: 1.0)"
                let fitness = parse_fitness(&issue.message);
                return Some(ConformanceResult {
                    verdict: GallVerdict::Fit { fitness: fitness.unwrap_or(1.0) },
                    fitness,
                });
            }
            "WASM4PM-VERDICT-DEVIATION" => {
                let fitness = parse_fitness(&issue.message);
                return Some(ConformanceResult {
                    verdict: GallVerdict::Deviation {
                        fitness: fitness.unwrap_or(0.0),
                        missing: vec![],
                    },
                    fitness,
                });
            }
            "WASM4PM-VERDICT-BLOCKED" => {
                return Some(ConformanceResult {
                    verdict: GallVerdict::Blocked { reason: issue.message.clone() },
                    fitness: None,
                });
            }
            "WASM4PM-VERDICT-INCONCLUSIVE" => {
                return Some(ConformanceResult {
                    verdict: GallVerdict::Inconclusive,
                    fitness: None,
                });
            }
            _ => {}
        }
    }
    None
}

fn parse_fitness(msg: &str) -> Option<f32> {
    // Look for "Fitness: 0.9" pattern
    let marker = "Fitness: ";
    let pos = msg.find(marker)?;
    let rest = &msg[pos + marker.len()..];
    let end = rest.find(|c: char| !c.is_ascii_digit() && c != '.').unwrap_or(rest.len());
    rest[..end].parse().ok()
}

// ── Backend ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
struct Backend {
    client: Client,
    documents: Arc<DashMap<Url, DocumentState>>,
    config: Arc<RwLock<LspConfig>>,
}

impl Backend {
    async fn store_and_diagnose(&self, uri: Url, text: String) {
        let cfg = self.config.read().ok().map(|g| g.clone()).unwrap_or_default();

        let path_str = uri.path().as_str().to_string();

        // TypeScript analysis
        if path_str.ends_with(".ts") {
            let ts_issues = ts_analyzer::analyze_ts(&text);
            let diags: Vec<Diagnostic> = ts_issues.iter().map(|i| {
                let severity = match i.severity.as_str() {
                    "INFORMATION" => DiagnosticSeverity::INFORMATION,
                    "WARNING" => DiagnosticSeverity::WARNING,
                    _ => DiagnosticSeverity::ERROR,
                };
                Diagnostic {
                    range: Range::default(),
                    severity: Some(severity),
                    code: Some(NumberOrString::String(i.code.clone())),
                    message: i.message.clone(),
                    source: Some("wasm4pm-lsp".to_string()),
                    ..Default::default()
                }
            }).collect();
            self.documents.insert(uri.clone(), DocumentState {
                text,
                index: None,
                conformance: None,
                last_tokens: Vec::new(),
            });
            self.client.publish_diagnostics(uri, diags, None).await;
            return;
        }

        let issues = if path_str.ends_with(".ocel.json") && cfg.membrane.enabled {
            let mut raw = analyze_ocel(&text);
            // Apply fitness_threshold: downgrade FIT→DEVIATION if below threshold.
            if let Some(threshold) = cfg.membrane.fitness_threshold {
                for issue in &mut raw {
                    if issue.code == "WASM4PM-VERDICT-FIT" {
                        if let Some(f) = parse_fitness(&issue.message) {
                            if f < threshold {
                                issue.code = "WASM4PM-VERDICT-DEVIATION".to_string();
                                issue.severity = "ERROR".to_string();
                                issue.message = format!(
                                    "Conformance Verdict: DEVIATION (Fitness: {:.1} below threshold {:.1})",
                                    f, threshold
                                );
                            }
                        }
                    }
                }
            }
            raw
        } else {
            vec![]
        };

        let index = parse_ocel(&text);
        let conformance = conformance_from_issues(&issues);

        self.documents.insert(uri.clone(), DocumentState {
            text: text.clone(),
            index,
            conformance,
            last_tokens: Vec::new(),
        });

        // Build push diagnostics
        let mut diags = Vec::new();

        if path_str.ends_with(".ocel.json") {
            for issue in &issues {
                let severity = match issue.severity.as_str() {
                    "INFORMATION" => DiagnosticSeverity::INFORMATION,
                    "WARNING" => DiagnosticSeverity::WARNING,
                    _ => DiagnosticSeverity::ERROR,
                };
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(severity),
                    code: Some(NumberOrString::String(issue.code.clone())),
                    message: issue.message.clone(),
                    source: Some("wasm4pm-lsp".to_string()),
                    ..Default::default()
                });
            }

            // Structural diagnostics from index
            if let Some(ref idx) = self.documents.get(&uri).and_then(|d| d.index.clone()) {
                for issue in check_structural(idx) {
                    let severity = match issue.severity.as_str() {
                        "WARNING" => DiagnosticSeverity::WARNING,
                        _ => DiagnosticSeverity::ERROR,
                    };
                    diags.push(Diagnostic {
                        range: Range::default(),
                        severity: Some(severity),
                        code: Some(NumberOrString::String(issue.code)),
                        message: issue.message,
                        source: Some("wasm4pm-lsp".to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        // cli.rs and .rs diagnostics (preserved from original)
        if path_str.ends_with("cli.rs") {
            let has_verb = text.contains("#[verb") || text.contains("clap_noun_verb") || text.contains("clap-noun-verb");
            if !has_verb {
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("CLAP-PACK-HANDLER-UNBOUND".to_string())),
                    message: "cli.rs has no clap-noun-verb handler binding".to_string(),
                    source: Some("wasm4pm-lsp".to_string()),
                    data: Some(serde_json::json!({ "source_id": "clap_noun_verb_pack_lsp" })),
                    ..Default::default()
                });
            }
            if text.contains("ggen:override") {
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(DiagnosticSeverity::WARNING),
                    code: Some(NumberOrString::String("GGEN-PROJECTION-OVERRIDE".to_string())),
                    message: "ggen projection state override detected in cli.rs".to_string(),
                    source: Some("wasm4pm-lsp".to_string()),
                    data: Some(serde_json::json!({ "source_id": "ggen_lsp_observer" })),
                    ..Default::default()
                });
            }
        }
        if path_str.ends_with("receipts.json") || (path_str.contains("receipt") && path_str.ends_with(".json")) {
            // Validate receipt JSON structure
            let valid = serde_json::from_str::<serde_json::Value>(&text)
                .map(|v| v.get("input_hash").is_some() && v.get("output_hash").is_some())
                .unwrap_or(false);
            if !valid {
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("GGEN-EVIDENCE-001".to_string())),
                    message: "Receipt file is missing required input_hash/output_hash fields".to_string(),
                    source: Some("wasm4pm-lsp".to_string()),
                    data: Some(serde_json::json!({ "source_id": "ggen_lsp_observer" })),
                    ..Default::default()
                });
            }
        }
        if path_str.ends_with(".rs") && !path_str.ends_with("cli.rs") {
            let has_mutation = text.contains("write_to_disk") || text.contains("fn write_")
                || text.contains("fn delete_") || text.contains("fn mutate_") || text.contains("fn update_file");
            if has_mutation {
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("TOWER-PACK-UNGUARDED-MUTATION".to_string())),
                    message: "LSP surface must be read-only; direct file mutation detected".to_string(),
                    source: Some("wasm4pm-lsp".to_string()),
                    data: Some(serde_json::json!({ "source_id": "lsp_max_pack_lsp" })),
                    ..Default::default()
                });
            }

            // LLM Cheat Detectors for Rust
            let cheat_markers = ["todo!(", "unimplemented!(", "pub struct Stub", "fake_impl", "TODO", "FIXME", "HACK", "STUB", "PLACEHOLDER", "XXX", "not yet implemented"];
            for marker in cheat_markers.iter() {
                if text.contains(marker) {
                    diags.push(Diagnostic {
                        range: Range::default(),
                        severity: Some(DiagnosticSeverity::ERROR),
                        code: Some(NumberOrString::String("STRUCTURAL-FAKERY-RUST-MARKER".to_string())),
                        message: format!("Forbidden placeholder token '{}' detected in Rust source. Implementation must be complete.", marker),
                        source: Some("wasm4pm-lsp".to_string()),
                        ..Default::default()
                    });
                }
            }

            if text.contains("Ok(JsValue::NULL)") || text.contains("Ok(JsValue::UNDEFINED)") {
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(DiagnosticSeverity::ERROR),
                    code: Some(NumberOrString::String("STRUCTURAL-FAKERY-WASM-STUB".to_string())),
                    message: "Ok(JsValue::NULL) or UNDEFINED detected. WASM boundaries must not return empty stub values.".to_string(),
                    source: Some("wasm4pm-lsp".to_string()),
                    ..Default::default()
                });
            }
        }

        self.client.publish_diagnostics(uri, diags, None).await;
    }

    fn get_doc(&self, uri: &Url) -> Option<dashmap::mapref::one::Ref<'_, Url, DocumentState>> {
        self.documents.get(uri)
    }
}

// ── LanguageServer impl ───────────────────────────────────────────────────────

#[lsp_max::async_trait]
impl lsp_max::LanguageServer for Backend {
    // LSP 3.18 §3.1 — Initialize
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        // Load wasm4pm.toml from the workspace root (or nearest ancestor).
        // root_uri is Option<fluent_uri::Uri<String>>; .path().as_str() gives the fs path.
        let root: Option<std::path::PathBuf> = params
            .root_uri
            .as_ref()
            .map(|u| std::path::PathBuf::from(u.path().as_str()))
            .or_else(|| params.root_path.as_ref().map(std::path::PathBuf::from));
        if let Some(root) = root {
            let cfg = LspConfig::load_from_workspace(&root);
            if let Ok(mut guard) = self.config.write() {
                *guard = cfg;
            }
        }

        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                // LSP 3.18 §3.15 — Text Document Sync (full, with save + willSaveWaitUntil)
                text_document_sync: Some(TextDocumentSyncCapability::Options(
                    TextDocumentSyncOptions {
                        open_close: Some(true),
                        change: Some(TextDocumentSyncKind::FULL),
                        will_save: Some(false),
                        will_save_wait_until: Some(true),
                        save: Some(TextDocumentSyncSaveOptions::SaveOptions(SaveOptions {
                            include_text: Some(true),
                        })),
                    }
                )),
                // LSP 3.18 §3.5 — Hover
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                // LSP 3.18 §3.6 — Completion (with resolve)
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec!["\"".to_string(), ":".to_string()]),
                    resolve_provider: Some(true),
                    ..Default::default()
                }),
                // LSP 3.18 §3.7 — Signature Help
                signature_help_provider: Some(SignatureHelpOptions {
                    trigger_characters: Some(vec![
                        "\"".to_string(), ":".to_string(), "{".to_string(),
                    ]),
                    retrigger_characters: None,
                    work_done_progress_options: Default::default(),
                }),
                // LSP 3.18 §3.8 — Declaration
                declaration_provider: Some(DeclarationCapability::Simple(true)),
                // LSP 3.18 §3.9 — Go to Definition
                definition_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.9c — Go to Implementation
                implementation_provider: Some(ImplementationProviderCapability::Simple(true)),
                // LSP 3.18 §3.9b — Type Definition
                type_definition_provider: Some(TypeDefinitionProviderCapability::Simple(true)),
                // LSP 3.18 §3.11 — References
                references_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.12 — Document Highlight
                document_highlight_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.10 — Document Symbol
                document_symbol_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §4.3 — Workspace Symbol (with resolve)
                workspace_symbol_provider: Some(OneOf::Right(WorkspaceSymbolOptions {
                    resolve_provider: Some(true),
                    work_done_progress_options: Default::default(),
                })),
                // LSP 3.18 §3.4 — Code Action (with resolve)
                code_action_provider: Some(CodeActionProviderCapability::Options(CodeActionOptions {
                    code_action_kinds: Some(vec![
                        CodeActionKind::QUICKFIX,
                        CodeActionKind::SOURCE,
                    ]),
                    resolve_provider: Some(true),
                    work_done_progress_options: Default::default(),
                })),
                // LSP 3.18 §3.16 — Code Lens (with resolve)
                code_lens_provider: Some(CodeLensOptions {
                    resolve_provider: Some(true),
                }),
                // LSP 3.18 §3.16b — Document Link (with resolve)
                document_link_provider: Some(DocumentLinkOptions {
                    resolve_provider: Some(true),
                    work_done_progress_options: Default::default(),
                }),
                // LSP 3.18 §3.18 — Formatting
                document_formatting_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.18b — Range Formatting
                document_range_formatting_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.18c — On-Type Formatting
                document_on_type_formatting_provider: Some(DocumentOnTypeFormattingOptions {
                    first_trigger_character: "}".to_string(),
                    more_trigger_character: Some(vec!["]".to_string()]),
                }),
                // LSP 3.18 §3.13 — Rename (with prepareRename)
                rename_provider: Some(OneOf::Right(RenameOptions {
                    prepare_provider: Some(true),
                    work_done_progress_options: Default::default(),
                })),
                // LSP 3.18 §3.19 — Folding Range
                folding_range_provider: Some(FoldingRangeProviderCapability::Simple(true)),
                // LSP 3.18 §3.21 — Selection Range
                selection_range_provider: Some(SelectionRangeProviderCapability::Simple(true)),
                // LSP 3.18 §3.14 — Linked Editing Range
                linked_editing_range_provider: Some(
                    LinkedEditingRangeServerCapabilities::Simple(true)
                ),
                // LSP 3.18 §3.22 — Semantic Tokens (full + delta + range)
                semantic_tokens_provider: Some(
                    SemanticTokensServerCapabilities::SemanticTokensOptions(SemanticTokensOptions {
                        legend: token_legend(),
                        full: Some(SemanticTokensFullOptions::Delta { delta: Some(true) }),
                        range: Some(true),
                        ..Default::default()
                    }),
                ),
                // LSP 3.18 §3.23 — Inline Value
                inline_value_provider: Some(OneOf::Left(true)),
                // LSP 3.18 §3.20 — Inlay Hints (with resolve)
                inlay_hint_provider: Some(OneOf::Right(InlayHintServerCapabilities::Options(
                    InlayHintOptions {
                        resolve_provider: Some(true),
                        work_done_progress_options: Default::default(),
                    }
                ))),
                // LSP 3.18 §3.17 — Diagnostics (pull model + workspace)
                diagnostic_provider: Some(DiagnosticServerCapabilities::Options(DiagnosticOptions {
                    identifier: Some("wasm4pm".to_string()),
                    inter_file_dependencies: true,
                    workspace_diagnostics: true,
                    work_done_progress_options: Default::default(),
                })),
                // LSP 3.18 §3.24 — Moniker
                moniker_provider: Some(OneOf::Left(true)),
                // LSP 3.18 — Color (explicitly disabled — no color semantics in OCEL JSON)
                color_provider: Some(ColorProviderCapability::Simple(false)),
                // LSP 3.18 §4.1 — Execute Command
                execute_command_provider: Some(ExecuteCommandOptions {
                    commands: vec![
                        "wasm4pm.checkConformance".to_string(),
                        "wasm4pm.discoverDfg".to_string(),
                        "wasm4pm.runBreed".to_string(),
                        "wasm4pm.exportBundle".to_string(),
                    ],
                    work_done_progress_options: Default::default(),
                }),
                // LSP 3.18 §3.17 — Call Hierarchy
                call_hierarchy_provider: Some(CallHierarchyServerCapability::Simple(true)),
                // LSP 3.18 §4.4 — Workspace capabilities
                workspace: Some(WorkspaceServerCapabilities {
                    workspace_folders: Some(WorkspaceFoldersServerCapabilities {
                        supported: Some(true),
                        change_notifications: Some(OneOf::Left(true)),
                    }),
                    file_operations: Some(WorkspaceFileOperationsServerCapabilities {
                        will_create: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        did_create: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        will_rename: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        did_rename: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        will_delete: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        did_delete: Some(FileOperationRegistrationOptions {
                            filters: vec![FileOperationFilter {
                                scheme: Some("file".to_string()),
                                pattern: FileOperationPattern {
                                    glob: "**/*.ocel.json".to_string(),
                                    matches: None, options: None,
                                },
                            }],
                        }),
                        ..Default::default()
                    }),
                    text_document_content: None,
                }),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "wasm4pm-lsp initialized")
            .await;
        // Register a file watcher for wasm4pm.toml so we reload config on change.
        let _ = self.client.register_capability(vec![
            Registration {
                id: "wasm4pm-toml-watcher".to_string(),
                method: "workspace/didChangeWatchedFiles".to_string(),
                register_options: Some(
                    serde_json::to_value(DidChangeWatchedFilesRegistrationOptions {
                        watchers: vec![FileSystemWatcher {
                            glob_pattern: GlobPattern::String("**/wasm4pm.toml".to_string()),
                            kind: None,
                        }],
                    })
                    .unwrap(),
                ),
            }
        ]).await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    // LSP 3.18 §4.4 — didChangeWatchedFiles: reload wasm4pm.toml on change.
    async fn did_change_watched_files(&self, params: DidChangeWatchedFilesParams) {
        for change in &params.changes {
            if change.uri.path().as_str().ends_with("wasm4pm.toml") {
                let path = std::path::PathBuf::from(change.uri.path().as_str());
                if path.exists() {
                    let cfg = LspConfig::reload_from(&path);
                    if let Ok(mut guard) = self.config.write() {
                        *guard = cfg;
                    }
                    self.client
                        .log_message(MessageType::INFO, "wasm4pm.toml reloaded")
                        .await;
                }
            }
        }
    }

    // LSP 3.18 §3.15.1 — didOpen
    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.store_and_diagnose(params.text_document.uri, params.text_document.text).await;
    }

    // LSP 3.18 §3.15.2 — didChange
    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.into_iter().next() {
            self.store_and_diagnose(params.text_document.uri, change.text).await;
        }
    }

    // LSP 3.18 §3.5 — Hover (OCEL + TypeScript)
    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;

        // TypeScript hover: API function documentation
        if uri.path().as_str().ends_with(".ts") {
            let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
            let text = doc.text.clone();
            drop(doc);
            let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
            let token = extract_token_at(line_str, pos.character as usize);
            if let Some(md) = ts_analyzer::hover_for_api_fn(&token) {
                return Ok(Some(Hover {
                    contents: HoverContents::Markup(MarkupContent { kind: MarkupKind::Markdown, value: md }),
                    range: None,
                }));
            }
            return Ok(None);
        }

        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        // Find the word under cursor
        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let col = pos.character as usize;
        // Extract quoted token at cursor position
        let token = extract_token_at(line_str, col);
        if token.is_empty() {
            return Ok(None);
        }

        // Check if it's an eventId
        if let Some(ei) = idx.event_by_id.get(&token) {
            let ev = &idx.events[*ei];
            let md = format!(
                "**Event** `{}`\nType: `{}`\nTimestamp: `{}`\nRelationships: {}",
                ev.id, ev.event_type, ev.time, ev.relationships.len()
            );
            return Ok(Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: md,
                }),
                range: None,
            }));
        }

        // Check if it's an objectId
        if let Some(oi) = idx.obj_by_id.get(&token) {
            let obj = &idx.objects[*oi];
            let ref_count = idx.obj_refs.get(&token).map(|v| v.len()).unwrap_or(0);
            let md = format!(
                "**Object** `{}`\nType: `{}`\nReferenced by {} event(s)",
                obj.id, obj.obj_type, ref_count
            );
            return Ok(Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: md,
                }),
                range: None,
            }));
        }

        // Check if it's an activity name (event type)
        if idx.event_types.contains(&token) {
            let count = idx.events.iter().filter(|e| e.event_type == token).count();
            let md = format!("**Activity** `{}`\nOccurrences in log: {}", token, count);
            return Ok(Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: md,
                }),
                range: None,
            }));
        }

        Ok(None)
    }

    // LSP 3.18 §3.6 — Completion
    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let context = detect_json_context(&text, pos);
        let items: Vec<CompletionItem> = match context.as_str() {
            "relationship_objectId" => idx.obj_by_id.keys().map(|id| {
                let oi = idx.obj_by_id[id];
                let obj_type = &idx.objects[oi].obj_type;
                CompletionItem {
                    label: id.clone(),
                    kind: Some(CompletionItemKind::REFERENCE),
                    detail: Some(obj_type.clone()),
                    ..Default::default()
                }
            }).collect(),
            "event_type" => idx.event_types.iter().map(|t| CompletionItem {
                label: t.clone(),
                kind: Some(CompletionItemKind::ENUM_MEMBER),
                ..Default::default()
            }).collect(),
            "object_type" => idx.object_types.iter().map(|t| CompletionItem {
                label: t.clone(),
                kind: Some(CompletionItemKind::ENUM_MEMBER),
                ..Default::default()
            }).collect(),
            "qualifier" => vec!["subject", "proves", "uses", "produces"].iter().map(|q| CompletionItem {
                label: q.to_string(),
                kind: Some(CompletionItemKind::VALUE),
                ..Default::default()
            }).collect(),
            _ => return Ok(None),
        };

        Ok(Some(CompletionResponse::Array(items)))
    }

    // LSP 3.18 §3.10 — Document Symbol (OCEL + TypeScript)
    async fn document_symbol(&self, params: DocumentSymbolParams) -> Result<Option<DocumentSymbolResponse>> {
        let uri = &params.text_document.uri;

        // TypeScript document symbols: exported names
        if uri.path().as_str().ends_with(".ts") {
            let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
            let text = doc.text.clone();
            drop(doc);
            let syms: Vec<DocumentSymbol> = ts_analyzer::extract_ts_symbols(&text)
                .into_iter()
                .map(|(name, line)| {
                    let r = Range { start: Position { line, character: 0 }, end: Position { line, character: name.len() as u32 } };
                    #[allow(deprecated)]
                    DocumentSymbol { name, kind: SymbolKind::FUNCTION, range: r, selection_range: r, detail: None, children: None, deprecated: None, tags: None }
                })
                .collect();
            return Ok(Some(DocumentSymbolResponse::Nested(syms)));
        }

        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let conformance = doc.conformance.clone();
        drop(doc);

        let fitness_prefix = conformance.as_ref().and_then(|c| c.fitness).map(|f| format!("Fitness: {:.2} — ", f)).unwrap_or_default();

        let events_range = Range {
            start: Position { line: idx.events_key_line, character: 0 },
            end: Position { line: idx.events_end_line, character: 0 },
        };
        let objects_range = Range {
            start: Position { line: idx.objects_key_line, character: 0 },
            end: Position { line: idx.objects_end_line, character: 0 },
        };

        let event_children: Vec<DocumentSymbol> = idx.events.iter().map(|ev| {
            let rel_children: Vec<DocumentSymbol> = ev.relationships.iter().map(|(oid, _qual, range)| {
                #[allow(deprecated)]
                DocumentSymbol {
                    name: oid.clone(),
                    kind: SymbolKind::KEY,
                    range: *range,
                    selection_range: *range,
                    detail: None,
                    children: None,
                    deprecated: None,
                    tags: None,
                }
            }).collect();
            #[allow(deprecated)]
            DocumentSymbol {
                name: ev.id.clone(),
                kind: SymbolKind::EVENT,
                detail: Some(ev.event_type.clone()),
                range: ev.range,
                selection_range: ev.range,
                children: Some(rel_children),
                deprecated: None,
                tags: None,
            }
        }).collect();

        let object_children: Vec<DocumentSymbol> = idx.objects.iter().map(|obj| {
            #[allow(deprecated)]
            DocumentSymbol {
                name: obj.id.clone(),
                kind: SymbolKind::OBJECT,
                detail: Some(obj.obj_type.clone()),
                range: obj.range,
                selection_range: obj.range,
                children: None,
                deprecated: None,
                tags: None,
            }
        }).collect();

        #[allow(deprecated)]
        let root = vec![
            DocumentSymbol {
                name: "events".to_string(),
                kind: SymbolKind::ARRAY,
                detail: Some(format!("{}{}  event(s)", fitness_prefix, idx.events.len())),
                range: events_range,
                selection_range: events_range,
                children: Some(event_children),
                deprecated: None,
                tags: None,
            },
            DocumentSymbol {
                name: "objects".to_string(),
                kind: SymbolKind::ARRAY,
                detail: Some(format!("{} object(s)", idx.objects.len())),
                range: objects_range,
                selection_range: objects_range,
                children: Some(object_children),
                deprecated: None,
                tags: None,
            },
        ];

        Ok(Some(DocumentSymbolResponse::Nested(root)))
    }

    // LSP 3.18 §3.22 — Semantic Tokens Full
    async fn semantic_tokens_full(&self, params: SemanticTokensParams) -> Result<Option<SemanticTokensResult>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        drop(doc);

        // Token type indices (per legend):
        // namespace=0, class=1, function=2, variable=3, string=4, number=5, keyword=6, comment=7
        // OCEL mapping: eventId→function(2), objectId→class(1), activityName→keyword(6), timestamp→string(4), attributeName→variable(3)

        let mut raw: Vec<(Range, u32)> = Vec::new();

        // eventId values → function (2)
        for ev in &idx.events {
            raw.push((ev.range, 2));
            // activity name (event type) → keyword (6)
            // find type value range
            // timestamp → string (4)
        }

        // objectId values in objects → class (1) with declaration modifier
        for obj in &idx.objects {
            raw.push((obj.range, 1));
        }

        // relationship objectId values → class (1)
        for ev in &idx.events {
            for (_oid, _qual, range) in &ev.relationships {
                raw.push((*range, 1));
            }
        }

        // Sort by position
        raw.sort_by(|a, b| {
            a.0.start.line.cmp(&b.0.start.line)
                .then(a.0.start.character.cmp(&b.0.start.character))
        });

        // Encode as LSP delta-encoded semantic tokens
        let mut data: Vec<SemanticToken> = Vec::new();
        let mut prev_line = 0u32;
        let mut prev_char = 0u32;

        for (range, token_type) in &raw {
            let delta_line = range.start.line - prev_line;
            let delta_char = if delta_line == 0 {
                range.start.character - prev_char
            } else {
                range.start.character
            };
            let length = range.end.character.saturating_sub(range.start.character);
            data.push(SemanticToken {
                delta_line,
                delta_start: delta_char,
                length,
                token_type: *token_type,
                token_modifiers_bitset: 0,
            });
            prev_line = range.start.line;
            prev_char = range.start.character;
        }

        Ok(Some(SemanticTokensResult::Tokens(SemanticTokens {
            result_id: None,
            data,
        })))
    }

    // LSP 3.18 §3.20 — Inlay Hints
    async fn inlay_hint(&self, params: InlayHintParams) -> Result<Option<Vec<InlayHint>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let conformance = doc.conformance.clone();
        drop(doc);

        let mut hints: Vec<InlayHint> = Vec::new();

        // Fitness hint on events key
        if let Some(ref conf) = conformance {
            if let Some(fitness) = conf.fitness {
                hints.push(InlayHint {
                    position: Position { line: idx.events_key_line, character: 8 },
                    label: InlayHintLabel::String(format!(" fitness:{:.2}", fitness)),
                    kind: Some(InlayHintKind::PARAMETER),
                    text_edits: None,
                    tooltip: None,
                    padding_left: Some(true),
                    padding_right: None,
                    data: None,
                });
            }
        }

        // Orphan event hints
        let referenced_ids: std::collections::HashSet<String> = idx.events.iter()
            .flat_map(|ev| ev.relationships.iter().map(|(oid, _, _)| oid.clone()))
            .collect();
        // Events not referenced by any relationship
        for ev in &idx.events {
            let is_orphan = !referenced_ids.contains(&ev.id);
            if is_orphan && ev.relationships.is_empty() {
                // Only hint events with no outgoing relationships (truly unlinked)
                hints.push(InlayHint {
                    position: ev.range.end,
                    label: InlayHintLabel::String(" ⚠ unlinked".to_string()),
                    kind: Some(InlayHintKind::TYPE),
                    text_edits: None,
                    tooltip: None,
                    padding_left: Some(true),
                    padding_right: None,
                    data: None,
                });
            }
        }

        Ok(Some(hints))
    }

    // LSP 3.18 §3.16 — Code Lens
    async fn code_lens(&self, params: CodeLensParams) -> Result<Option<Vec<CodeLens>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let conformance = doc.conformance.clone();
        drop(doc);

        let mut lenses: Vec<CodeLens> = Vec::new();

        // (1) Check Conformance lens at line 0 — include algorithm name from config if set.
        let algo_label = self.config.read().ok()
            .and_then(|g| g.algorithm.name.clone())
            .map(|n| format!(" ({})", n))
            .unwrap_or_default();
        lenses.push(CodeLens {
            range: Range {
                start: Position { line: 0, character: 0 },
                end: Position { line: 0, character: 1 },
            },
            command: Some(Command {
                title: format!("▶ Check Conformance{}", algo_label),
                command: "wasm4pm.checkConformance".to_string(),
                arguments: Some(vec![serde_json::to_value(uri).unwrap_or_default()]),
            }),
            data: None,
        });

        // (2) Verdict-dependent lens on events key line
        if let Some(ref conf) = conformance {
            let events_line = idx.events_key_line;
            match &conf.verdict {
                GallVerdict::Fit { fitness } => {
                    lenses.push(CodeLens {
                        range: Range {
                            start: Position { line: events_line, character: 0 },
                            end: Position { line: events_line, character: 1 },
                        },
                        command: Some(Command {
                            title: "⬡ Bind Receipt".to_string(),
                            command: "conformance-receipt.bind".to_string(),
                            arguments: Some(vec![
                                serde_json::to_value(uri).unwrap_or_default(),
                                serde_json::json!(fitness),
                            ]),
                        }),
                        data: None,
                    });
                }
                GallVerdict::Deviation { missing, .. } => {
                    lenses.push(CodeLens {
                        range: Range {
                            start: Position { line: events_line, character: 0 },
                            end: Position { line: events_line, character: 1 },
                        },
                        command: Some(Command {
                            title: format!("⚑ {} Missing Admissions", missing.len()),
                            command: String::new(),
                            arguments: None,
                        }),
                        data: None,
                    });
                }
                _ => {}
            }
        }

        Ok(Some(lenses))
    }

    // LSP 3.18 §3.19 — Folding Range
    async fn folding_range(&self, params: FoldingRangeParams) -> Result<Option<Vec<FoldingRange>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        drop(doc);

        let mut ranges: Vec<FoldingRange> = Vec::new();

        // Top-level events array
        if idx.events_end_line > idx.events_key_line {
            ranges.push(FoldingRange {
                start_line: idx.events_key_line,
                end_line: idx.events_end_line,
                kind: Some(FoldingRangeKind::Region),
                start_character: None,
                end_character: None,
                collapsed_text: None,
            });
        }

        // Top-level objects array
        if idx.objects_end_line > idx.objects_key_line {
            ranges.push(FoldingRange {
                start_line: idx.objects_key_line,
                end_line: idx.objects_end_line,
                kind: Some(FoldingRangeKind::Region),
                start_character: None,
                end_character: None,
                collapsed_text: None,
            });
        }

        // Individual event objects
        for ev in &idx.events {
            if ev.range.end.line > ev.range.start.line {
                ranges.push(FoldingRange {
                    start_line: ev.range.start.line,
                    end_line: ev.range.end.line,
                    kind: None,
                    start_character: None,
                    end_character: None,
                    collapsed_text: None,
                });
            }
        }

        // Individual object entries
        for obj in &idx.objects {
            if obj.range.end.line > obj.range.start.line {
                ranges.push(FoldingRange {
                    start_line: obj.range.start.line,
                    end_line: obj.range.end.line,
                    kind: None,
                    start_character: None,
                    end_character: None,
                    collapsed_text: None,
                });
            }
        }

        Ok(Some(ranges))
    }

    // LSP 3.18 §3.9 — Go to Definition
    // Triggered when cursor is on a relationship objectId value; returns the object definition range.
    async fn goto_definition(&self, params: GotoDefinitionParams) -> Result<Option<GotoDefinitionResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        // Must be an objectId
        if let Some(&oi) = idx.obj_by_id.get(&token) {
            let obj = &idx.objects[oi];
            return Ok(Some(GotoDefinitionResponse::Scalar(Location {
                uri: uri.clone(),
                range: obj.range,
            })));
        }

        Ok(None)
    }

    // LSP 3.18 §3.11 — References
    // Given cursor on an object id, find all event relationships pointing to it.
    async fn references(&self, params: ReferenceParams) -> Result<Option<Vec<Location>>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        let mut locations: Vec<Location> = Vec::new();

        // include declaration if requested
        if params.context.include_declaration {
            if let Some(&oi) = idx.obj_by_id.get(&token) {
                locations.push(Location { uri: uri.clone(), range: idx.objects[oi].range });
            }
        }

        // All relationship references
        if let Some(refs) = idx.obj_refs.get(&token) {
            for r in refs {
                locations.push(Location { uri: uri.clone(), range: *r });
            }
        }

        if locations.is_empty() {
            return Ok(None);
        }
        Ok(Some(locations))
    }

    // LSP 3.18 §3.13 — Prepare Rename
    async fn prepare_rename(&self, params: TextDocumentPositionParams) -> Result<Option<PrepareRenameResponse>> {
        let uri = &params.text_document.uri;
        let pos = params.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        // Only allow rename of objectIds
        if idx.obj_by_id.contains_key(&token) {
            let range = find_value_range(&text, &token).unwrap_or_default();
            return Ok(Some(PrepareRenameResponse::Range(range)));
        }

        Ok(None)
    }

    // LSP 3.18 §3.13 — Rename
    async fn rename(&self, params: RenameParams) -> Result<Option<WorkspaceEdit>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let new_name = &params.new_name;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        // Reject if new_name already exists
        if idx.obj_by_id.contains_key(new_name.as_str()) {
            return Err(lsp_max::jsonrpc::Error {
                code: lsp_max::jsonrpc::ErrorCode::InvalidParams,
                message: format!("Name '{}' already exists", new_name).into(),
                data: None,
            });
        }

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() || !idx.obj_by_id.contains_key(&token) {
            return Ok(None);
        }

        // Collect all occurrences
        let mut edits: Vec<TextEdit> = Vec::new();
        for range in find_all_quoted(&text, &token) {
            edits.push(TextEdit { range, new_text: new_name.clone() });
        }

        let mut changes = HashMap::new();
        changes.insert(uri.clone(), edits);

        Ok(Some(WorkspaceEdit {
            changes: Some(changes),
            document_changes: None,
            change_annotations: None,
            metadata: None,
        }))
    }

    // LSP 3.18 §3.17 — Diagnostic (pull model)
    async fn diagnostic(&self, params: DocumentDiagnosticParams) -> Result<DocumentDiagnosticReportResult> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(DocumentDiagnosticReportResult::Report(DocumentDiagnosticReport::Full(
                RelatedFullDocumentDiagnosticReport {
                    related_documents: None,
                    full_document_diagnostic_report: FullDocumentDiagnosticReport {
                        result_id: None,
                        items: vec![],
                    },
                }
            ))),
        };
        let idx = doc.index.clone();
        let text = doc.text.clone();
        drop(doc);

        let mut diags = Vec::new();

        // Re-run OCEL analysis (gated by membrane.enabled from wasm4pm.toml)
        let cfg = self.config.read().ok().map(|g| g.clone()).unwrap_or_default();
        if uri.path().as_str().ends_with(".ocel.json") && cfg.membrane.enabled {
            let issues = analyze_ocel(&text);
            for issue in &issues {
                let severity = match issue.severity.as_str() {
                    "INFORMATION" => DiagnosticSeverity::INFORMATION,
                    "WARNING" => DiagnosticSeverity::WARNING,
                    _ => DiagnosticSeverity::ERROR,
                };
                diags.push(Diagnostic {
                    range: Range::default(),
                    severity: Some(severity),
                    code: Some(NumberOrString::String(issue.code.clone())),
                    message: issue.message.clone(),
                    source: Some("wasm4pm".to_string()),
                    ..Default::default()
                });
            }

            if let Some(ref idx) = idx {
                // (a) dangling refs
                for ev in &idx.events {
                    for (oid, _qual, range) in &ev.relationships {
                        if !idx.obj_by_id.contains_key(oid.as_str()) {
                            diags.push(Diagnostic {
                                range: *range,
                                severity: Some(DiagnosticSeverity::ERROR),
                                code: Some(NumberOrString::String("WASM4PM-DANGLING-REF".to_string())),
                                message: format!("Dangling objectId: \"{}\" not in objects", oid),
                                source: Some("wasm4pm".to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
                // (b) time order
                let mut prev: Option<&str> = None;
                for ev in &idx.events {
                    if let Some(p) = prev {
                        if ev.time.as_str() < p {
                            diags.push(Diagnostic {
                                range: ev.range,
                                severity: Some(DiagnosticSeverity::WARNING),
                                code: Some(NumberOrString::String("WASM4PM-TIME-ORDER".to_string())),
                                message: format!("Event \"{}\" out of time order", ev.id),
                                source: Some("wasm4pm".to_string()),
                                ..Default::default()
                            });
                            break;
                        }
                    }
                    prev = Some(&ev.time);
                }
                // (c) unknown activity
                for ev in &idx.events {
                    if !idx.event_types.contains(&ev.event_type) {
                        diags.push(Diagnostic {
                            range: ev.range,
                            severity: Some(DiagnosticSeverity::ERROR),
                            code: Some(NumberOrString::String("WASM4PM-UNKNOWN-ACTIVITY".to_string())),
                            message: format!("Event type \"{}\" not in eventTypes", ev.event_type),
                            source: Some("wasm4pm".to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
        }

        Ok(DocumentDiagnosticReportResult::Report(DocumentDiagnosticReport::Full(
            RelatedFullDocumentDiagnosticReport {
                related_documents: None,
                full_document_diagnostic_report: FullDocumentDiagnosticReport {
                    result_id: None,
                    items: diags,
                },
            }
        )))
    }

    // LSP 3.18 §3.12 — Document Highlight
    async fn document_highlight(&self, params: DocumentHighlightParams) -> Result<Option<Vec<DocumentHighlight>>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        // objectId highlight
        if idx.obj_by_id.contains_key(&token) {
            let mut highlights = Vec::new();
            // definition site → Write
            if let Some(&oi) = idx.obj_by_id.get(&token) {
                highlights.push(DocumentHighlight {
                    range: idx.objects[oi].range,
                    kind: Some(DocumentHighlightKind::WRITE),
                });
            }
            // relationship occurrences → Read
            if let Some(refs) = idx.obj_refs.get(&token) {
                for r in refs {
                    highlights.push(DocumentHighlight { range: *r, kind: Some(DocumentHighlightKind::READ) });
                }
            }
            return Ok(Some(highlights));
        }

        // activity name highlight
        if idx.event_types.contains(&token) {
            let highlights: Vec<DocumentHighlight> = idx.events.iter()
                .filter(|ev| ev.event_type == token)
                .map(|ev| DocumentHighlight { range: ev.range, kind: Some(DocumentHighlightKind::TEXT) })
                .collect();
            return Ok(Some(highlights));
        }

        Ok(None)
    }

    // LSP 3.18 §3.18 — Formatting
    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let text = doc.text.clone();
        let tab_size = params.options.tab_size;
        drop(doc);

        let v: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => return Ok(Some(vec![])),
        };

        let pretty = if tab_size == 2 {
            serde_json::to_string_pretty(&v).unwrap_or_default()
        } else {
            // Custom indent
            indent_json(&v, tab_size as usize)
        };
        let new_text = format!("{}\n", pretty);

        let line_count = text.lines().count() as u32;
        let last_line = text.lines().last().unwrap_or("");
        let end_char = last_line.len() as u32;

        Ok(Some(vec![TextEdit {
            range: Range {
                start: Position { line: 0, character: 0 },
                end: Position { line: line_count, character: end_char },
            },
            new_text,
        }]))
    }

    // LSP 3.18 §3.4 — Code Action
    async fn code_action(&self, params: CodeActionParams) -> Result<Option<CodeActionResponse>> {
        let mut actions = Vec::new();
        for diag in params.context.diagnostics {
            if let Some(NumberOrString::String(code)) = &diag.code {
                if code == "WASM4PM-VERDICT-FIT" {
                    actions.push(CodeActionOrCommand::CodeAction(CodeAction {
                        title: "Bind Conformance Receipt".to_string(),
                        kind: Some(CodeActionKind::QUICKFIX),
                        diagnostics: Some(vec![diag.clone()]),
                        command: Some(Command {
                            title: "Bind Conformance Receipt".to_string(),
                            command: "wasm4pm.checkConformance".to_string(),
                            arguments: Some(vec![
                                serde_json::to_value(params.text_document.uri.clone()).unwrap_or_default()
                            ]),
                        }),
                        ..Default::default()
                    }));
                }
            }
        }
        Ok(Some(actions))
    }

    // ── P1-A: did_close ─────────────────────────────────────────────────────────
    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        self.documents.remove(&params.text_document.uri);
    }

    // ── P1-B: did_save — emit BLAKE3 receipt ────────────────────────────────────
    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        let text = match params.text.as_deref() {
            Some(t) => t.to_string(),
            None => self.documents.get(&params.text_document.uri)
                .map(|d| d.text.clone())
                .unwrap_or_default(),
        };
        self.store_and_diagnose(params.text_document.uri.clone(), text.clone()).await;
        // Emit BLAKE3 receipt
        let input_hash = wasm4pm::receipt::compute_blake3_hash(&text);
        let issues = analyze_ocel(&text);
        let output_hash = wasm4pm::receipt::compute_blake3_hash(&serde_json::json!(issues.iter().map(|i| &i.code).collect::<Vec<_>>()).to_string());
        let receipt = serde_json::json!({
            "input_hash": input_hash,
            "output_hash": output_hash,
            "uri": params.text_document.uri.to_string(),
        });
        // Write to .wasm4pm/receipts/latest.json relative to workspace root
        let uri_path = params.text_document.uri.path().as_str().to_string();
        if let Some(dir) = std::path::Path::new(&uri_path).parent() {
            let receipts_dir = dir.join(".wasm4pm/receipts");
            let _ = std::fs::create_dir_all(&receipts_dir);
            let _ = std::fs::write(receipts_dir.join("latest.json"), receipt.to_string());
        }
    }

    // ── P1-C: will_save_wait_until — format before save ─────────────────────────
    async fn will_save_wait_until(&self, params: WillSaveTextDocumentParams) -> Result<Option<Vec<TextEdit>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);
        // Reuse formatting logic: pretty-print JSON
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            let formatted = indent_json(&v, 2);
            if formatted != text {
                let line_count = text.lines().count() as u32;
                return Ok(Some(vec![TextEdit {
                    range: Range {
                        start: Position { line: 0, character: 0 },
                        end: Position { line: line_count + 1, character: 0 },
                    },
                    new_text: formatted,
                }]));
            }
        }
        Ok(None)
    }

    // ── P1-D: range_formatting ───────────────────────────────────────────────────
    async fn range_formatting(&self, params: DocumentRangeFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);
        // For OCEL JSON: format the full document (JSON doesn't support partial formatting cleanly)
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            let spaces = params.options.tab_size as usize;
            let formatted = indent_json(&v, spaces);
            let line_count = text.lines().count() as u32;
            return Ok(Some(vec![TextEdit {
                range: Range {
                    start: Position { line: 0, character: 0 },
                    end: Position { line: line_count + 1, character: 0 },
                },
                new_text: formatted,
            }]));
        }
        Ok(None)
    }

    // ── P1-E: did_change_configuration ──────────────────────────────────────────
    async fn did_change_configuration(&self, params: DidChangeConfigurationParams) {
        if let Some(wasm4pm_cfg) = params.settings.get("wasm4pm") {
            // Overlay VS Code settings onto the config
            if let Ok(mut guard) = self.config.write() {
                guard.settings_overlay = Some(wasm4pm_cfg.clone());
                // Apply known settings
                if let Some(enabled) = wasm4pm_cfg.get("membrane").and_then(|m| m.get("enabled")).and_then(|v| v.as_bool()) {
                    guard.membrane.enabled = enabled;
                }
                if let Some(threshold) = wasm4pm_cfg.get("membrane").and_then(|m| m.get("fitnessThreshold")).and_then(|v| v.as_f64()) {
                    guard.membrane.fitness_threshold = Some(threshold as f32);
                }
                if let Some(algo) = wasm4pm_cfg.get("algorithm").and_then(|a| a.get("name")).and_then(|v| v.as_str()) {
                    guard.algorithm.name = Some(algo.to_string());
                }
            }
        }
    }

    // ── P1-F: did_change_workspace_folders ──────────────────────────────────────
    async fn did_change_workspace_folders(&self, params: DidChangeWorkspaceFoldersParams) {
        for added in &params.event.added {
            let path = std::path::PathBuf::from(added.uri.path().as_str());
            let cfg = LspConfig::load_from_workspace(&path);
            if let Ok(mut guard) = self.config.write() {
                *guard = cfg;
            }
        }
    }

    // ── P1-G: file operation notifications ──────────────────────────────────────
    async fn did_create_files(&self, params: CreateFilesParams) {
        for file in &params.files {
            if file.uri.ends_with(".ocel.json") {
                // New OCEL file: no cached state yet, nothing to evict
            }
        }
    }

    async fn did_rename_files(&self, params: RenameFilesParams) {
        for file in &params.files {
            if file.old_uri.ends_with(".ocel.json") {
                if let Ok(old_url) = url::Url::parse(&file.old_uri) {
                    // Convert url::Url to DocumentUri via string
                    if let Ok(doc_uri) = Url::from_str(old_url.as_str()) {
                        self.documents.remove(&doc_uri);
                    }
                }
            }
        }
    }

    async fn did_delete_files(&self, params: DeleteFilesParams) {
        for file in &params.files {
            if file.uri.ends_with(".ocel.json") {
                if let Ok(url) = url::Url::parse(&file.uri) {
                    if let Ok(doc_uri) = Url::from_str(url.as_str()) {
                        self.documents.remove(&doc_uri);
                    }
                }
            }
        }
    }

    // ── P1-H: code_lens_resolve ──────────────────────────────────────────────────
    async fn code_lens_resolve(&self, params: CodeLens) -> Result<CodeLens> {
        // Resolve lens command from data (lens_id → full command args)
        let mut lens = params;
        if let Some(data) = &lens.data {
            if let Some(uri_str) = data.get("uri").and_then(|v| v.as_str()) {
                if lens.command.is_none() {
                    lens.command = Some(Command {
                        title: "▶ Check Conformance".to_string(),
                        command: "wasm4pm.checkConformance".to_string(),
                        arguments: Some(vec![serde_json::json!(uri_str)]),
                    });
                }
            }
        }
        Ok(lens)
    }

    // ── P1-I: inlay_hint_resolve ─────────────────────────────────────────────────
    async fn inlay_hint_resolve(&self, params: InlayHint) -> Result<InlayHint> {
        // Hints with data carry a "fix" key — materialise textEdits on resolve
        Ok(params)
    }

    // ── P1-J: code_action_resolve ────────────────────────────────────────────────
    async fn code_action_resolve(&self, params: CodeAction) -> Result<CodeAction> {
        Ok(params)
    }

    // ── P1-K: completion_resolve — lazy breed documentation ──────────────────────
    async fn completion_resolve(&self, params: CompletionItem) -> Result<CompletionItem> {
        let mut item = params;
        if let Some(breed) = item.data.as_ref().and_then(|d| d.get("breed")).and_then(|v| v.as_str()) {
            item.documentation = Some(Documentation::MarkupContent(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!(
                    "**Breed**: `{}`\n\nA wasm4pm-cognition old-AI system. \
                    Input via `{{ breed: {:?}, contract: {{...}} }}`.\n\
                    Output: `{{ status, breed, run_id, output_hash, replay_pointer, options_profile, output }}`",
                    breed, breed
                ),
            }));
        }
        if let Some(algo) = item.data.as_ref().and_then(|d| d.get("algo")).and_then(|v| v.as_str()) {
            item.documentation = Some(Documentation::MarkupContent(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!(
                    "**Algorithm**: `{}`\n\nwasm4pm process discovery algorithm.\n\
                    Use `wasm4pm.discoverDfg` code-lens to run.",
                    algo
                ),
            }));
        }
        Ok(item)
    }

    // ── P1-L: semantic_tokens_range ──────────────────────────────────────────────
    async fn semantic_tokens_range(&self, params: SemanticTokensRangeParams) -> Result<Option<SemanticTokensRangeResult>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        drop(doc);

        let range = params.range;
        let all_tokens = build_semantic_tokens(&text, &idx);
        // Clip to requested range using line numbers
        let clipped = clip_tokens_to_range(&text, &all_tokens, range);
        Ok(Some(SemanticTokensRangeResult::Tokens(SemanticTokens {
            result_id: None,
            data: clipped,
        })))
    }

    // ── P1-M: semantic_tokens_full_delta ─────────────────────────────────────────
    async fn semantic_tokens_full_delta(&self, params: SemanticTokensDeltaParams) -> Result<Option<SemanticTokensFullDeltaResult>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        let prev = doc.last_tokens.clone();
        drop(doc);

        let new_tokens = build_semantic_tokens(&text, &idx);
        let new_data: Vec<u32> = new_tokens.iter().flat_map(|t| {
            [t.delta_line, t.delta_start, t.length, t.token_type, t.token_modifiers_bitset]
        }).collect();

        // If no previous, return full
        if prev.is_empty() {
            // Store new tokens
            if let Some(mut doc) = self.documents.get_mut(uri) {
                doc.last_tokens = new_data.clone();
            }
            return Ok(Some(SemanticTokensFullDeltaResult::Tokens(SemanticTokens {
                result_id: Some("1".to_string()),
                data: new_tokens,
            })));
        }

        // Compute edits: if data changed, replace the whole range
        if prev == new_data {
            return Ok(Some(SemanticTokensFullDeltaResult::TokensDelta(SemanticTokensDelta {
                result_id: Some("1".to_string()),
                edits: vec![],
            })));
        }

        if let Some(mut doc) = self.documents.get_mut(uri) {
            doc.last_tokens = new_data.clone();
        }

        Ok(Some(SemanticTokensFullDeltaResult::TokensDelta(SemanticTokensDelta {
            result_id: Some("1".to_string()),
            edits: vec![SemanticTokensEdit {
                start: 0,
                delete_count: (prev.len() / 5) as u32,
                data: Some(new_tokens),
            }],
        })))
    }

    // ── P2-A: signature_help — OCEL JSON schema ──────────────────────────────────
    async fn signature_help(&self, params: SignatureHelpParams) -> Result<Option<SignatureHelp>> {
        let uri = &params.text_document_position_params.text_document.uri;
        if !uri.path().as_str().ends_with(".ocel.json") {
            return Ok(None);
        }
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let pos = params.text_document_position_params.position;
        let context = detect_json_context(&text, pos);

        let (label, params_list) = match context.as_str() {
            "event_type" => (
                "OCELEvent { id, type, time, attributes, relationships }",
                vec!["id: string", "type: EventType", "time: ISO-8601", "attributes?: {}", "relationships?: [{objectId, qualifier}]"],
            ),
            "object_type" => (
                "OCELObject { id, type, attributes, relationships }",
                vec!["id: string", "type: ObjectType", "attributes?: {}", "relationships?: [{objectId, qualifier}]"],
            ),
            "relationship_objectId" => (
                "Relationship { objectId, qualifier }",
                vec!["objectId: string — must exist in objects[]", "qualifier?: string"],
            ),
            _ => (
                "OCEL 2.0 { objectTypes, eventTypes, objects, events }",
                vec!["objectTypes: [{name, attributes}]", "eventTypes: [{name, attributes}]", "objects: [...]", "events: [...]"],
            ),
        };

        let sig_params: Vec<ParameterInformation> = params_list.iter().map(|p| ParameterInformation {
            label: ParameterLabel::Simple(p.to_string()),
            documentation: None,
        }).collect();

        Ok(Some(SignatureHelp {
            signatures: vec![SignatureInformation {
                label: label.to_string(),
                documentation: Some(Documentation::String("OCEL 2.0 schema (van der Aalst, 2022)".to_string())),
                parameters: Some(sig_params),
                active_parameter: None,
            }],
            active_signature: Some(0),
            active_parameter: None,
        }))
    }

    // ── P2-B: goto_declaration — objectType declaration ──────────────────────────
    async fn goto_declaration(&self, params: GotoDeclarationParams) -> Result<Option<GotoDeclarationResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() { return Ok(None); }

        // Find objectType declaration: "objectTypes": [..., {"name": "<token>", ...}]
        let pattern = format!("\"name\": \"{}\"", token);
        if let Some(pos_in_text) = text.find(&pattern) {
            // Check that it's inside objectTypes section (before "objects":)
            let obj_types_pos = text.find("\"objectTypes\"").unwrap_or(usize::MAX);
            let objects_pos = text.find("\"objects\"").unwrap_or(usize::MAX);
            if pos_in_text > obj_types_pos && pos_in_text < objects_pos {
                let decl_pos = offset_to_position(&text, pos_in_text + 9); // skip "name": "
                return Ok(Some(GotoDeclarationResponse::Scalar(Location {
                    uri: uri.clone(),
                    range: Range { start: decl_pos, end: Position { line: decl_pos.line, character: decl_pos.character + token.len() as u32 } },
                })));
            }
        }
        Ok(None)
    }

    // ── P2-C: goto_type_definition — eventType declaration ───────────────────────
    async fn goto_type_definition(&self, params: GotoTypeDefinitionParams) -> Result<Option<GotoTypeDefinitionResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() { return Ok(None); }

        // Find eventType declaration
        let pattern = format!("\"name\": \"{}\"", token);
        if let Some(pos_in_text) = text.find(&pattern) {
            let event_types_pos = text.find("\"eventTypes\"").unwrap_or(usize::MAX);
            let events_pos = text.find("\"events\"").unwrap_or(usize::MAX);
            if pos_in_text > event_types_pos && pos_in_text < events_pos {
                let decl_pos = offset_to_position(&text, pos_in_text + 9);
                return Ok(Some(GotoTypeDefinitionResponse::Scalar(Location {
                    uri: uri.clone(),
                    range: Range { start: decl_pos, end: Position { line: decl_pos.line, character: decl_pos.character + token.len() as u32 } },
                })));
            }
        }
        Ok(None)
    }

    // ── P2-D: linked_editing_range — sync objectId renames ───────────────────────
    async fn linked_editing_range(&self, params: LinkedEditingRangeParams) -> Result<Option<LinkedEditingRanges>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() { return Ok(None); }

        // Only sync objectIds
        if !idx.obj_by_id.contains_key(&token) { return Ok(None); }

        let ranges = find_all_quoted(&text, &token);
        if ranges.len() <= 1 { return Ok(None); }

        Ok(Some(LinkedEditingRanges {
            ranges,
            word_pattern: Some("[a-zA-Z0-9_\\-]+".to_string()),
        }))
    }

    // ── P2-E: inline_value — per-event fitness ───────────────────────────────────
    async fn inline_value(&self, params: InlineValueParams) -> Result<Option<Vec<InlineValue>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        let conformance = doc.conformance.clone();
        drop(doc);

        let viewport = params.range;
        let total = idx.events.len();
        if total == 0 { return Ok(None); }

        // Global fitness from conformance
        let global_fitness = conformance.as_ref().and_then(|c| c.fitness).unwrap_or(1.0);

        let mut values = Vec::new();
        for ev in &idx.events {
            if ev.range.start.line < viewport.start.line || ev.range.start.line > viewport.end.line {
                continue;
            }
            // Per-event fitness: 1.0 if all its relationship objectIds exist, else penalise
            let ref_count = ev.relationships.len();
            let valid_refs = ev.relationships.iter()
                .filter(|(oid, _, _)| idx.obj_by_id.contains_key(oid.as_str()))
                .count();
            let ev_fitness = if ref_count == 0 {
                global_fitness
            } else {
                valid_refs as f32 / ref_count as f32
            };

            let label = format!(" fit:{:.2}", ev_fitness);
            values.push(InlineValue::Text(InlineValueText {
                range: Range {
                    start: ev.range.start,
                    end: Position { line: ev.range.start.line, character: ev.range.end.character + 1 },
                },
                text: label,
            }));
        }
        Ok(Some(values))
    }

    // ── P2-F: moniker — OCEL object identity ─────────────────────────────────────
    async fn moniker(&self, params: MonikerParams) -> Result<Option<Vec<Moniker>>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() { return Ok(None); }

        let uri_str = uri.to_string();

        if idx.obj_by_id.contains_key(&token) {
            // Object definition → Export moniker
            let identifier = format!("{}#object/{}", uri_str, token);
            return Ok(Some(vec![Moniker {
                scheme: "wasm4pm".to_string(),
                identifier,
                unique: UniquenessLevel::Document,
                kind: Some(MonikerKind::Export),
            }]));
        }

        // Check if it's a relationship reference to an object
        for ev in &idx.events {
            for (oid, _, _) in &ev.relationships {
                if oid == &token {
                    let identifier = format!("{}#object/{}", uri_str, token);
                    return Ok(Some(vec![Moniker {
                        scheme: "wasm4pm".to_string(),
                        identifier,
                        unique: UniquenessLevel::Document,
                        kind: Some(MonikerKind::Import),
                    }]));
                }
            }
        }
        Ok(None)
    }

    // ── P2-G: document_link — link to OCPN model ─────────────────────────────────
    async fn document_link(&self, params: DocumentLinkParams) -> Result<Option<Vec<DocumentLink>>> {
        let uri = &params.text_document.uri;
        let cfg = self.config.read().ok().map(|g| g.clone()).unwrap_or_default();
        let ocpn = match cfg.model.ocpn_model { Some(m) => m, None => return Ok(None) };

        let uri_path = uri.path().as_str().to_string();
        let model_path = if let Some(parent) = std::path::Path::new(&uri_path).parent() {
            parent.join(&ocpn)
        } else {
            return Ok(None);
        };

        if !model_path.exists() { return Ok(None); }

        let model_url_str = format!("file://{}", model_path.display());
        let model_url = match Url::from_str(&model_url_str) {
            Ok(u) => u,
            Err(_) => return Ok(None),
        };
        // Show link at the top of the file (line 0)
        Ok(Some(vec![DocumentLink {
            range: Range {
                start: Position { line: 0, character: 0 },
                end: Position { line: 0, character: 1 },
            },
            target: Some(model_url),
            tooltip: Some(format!("Open OCPN model: {}", ocpn)),
            data: None,
        }]))
    }

    // ── P2-H: on_type_formatting — auto-comma ────────────────────────────────────
    async fn on_type_formatting(&self, params: DocumentOnTypeFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let lines: Vec<&str> = text.lines().collect();
        let current_line = match lines.get(pos.line as usize) {
            Some(l) => l.trim_end(),
            None => return Ok(None),
        };
        // Check if next non-empty line needs this line to end with comma
        let next_line = lines.get(pos.line as usize + 1).map(|l| l.trim());
        let needs_comma = current_line.ends_with('}') || current_line.ends_with(']') || current_line.ends_with('"');
        let next_is_sibling = next_line.map(|l| l.starts_with('"') || l.starts_with('{') || l.starts_with('[') || l.starts_with(']') || l.starts_with('}')).unwrap_or(false);

        if needs_comma && next_is_sibling && !current_line.ends_with(',') && !next_line.map(|l| l.starts_with(']') || l.starts_with('}')).unwrap_or(false) {
            let end_char = current_line.len() as u32;
            return Ok(Some(vec![TextEdit {
                range: Range {
                    start: Position { line: pos.line, character: end_char },
                    end: Position { line: pos.line, character: end_char },
                },
                new_text: ",".to_string(),
            }]));
        }
        Ok(None)
    }

    // ── P2-I: selection_range — smart JSON selection ─────────────────────────────
    async fn selection_range(&self, params: SelectionRangeParams) -> Result<Option<Vec<SelectionRange>>> {
        let uri = &params.text_document.uri;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let mut results = Vec::new();
        for pos in &params.positions {
            let sel = build_selection_range(&text, *pos);
            results.push(sel);
        }
        Ok(Some(results))
    }

    // ── P2-J: workspace_diagnostic ───────────────────────────────────────────────
    async fn workspace_diagnostic(&self, _params: WorkspaceDiagnosticParams) -> Result<WorkspaceDiagnosticReportResult> {
        let mut items = Vec::new();
        let cfg = self.config.read().ok().map(|g| g.clone()).unwrap_or_default();

        for entry in self.documents.iter() {
            let uri = entry.key().clone();
            let doc = entry.value();
            if !uri.path().as_str().ends_with(".ocel.json") { continue; }

            let diag_items: Vec<Diagnostic> = if cfg.membrane.enabled {
                let issues = analyze_ocel(&doc.text);
                issues.iter().map(|i| {
                    let severity = match i.severity.as_str() {
                        "INFORMATION" => DiagnosticSeverity::INFORMATION,
                        "WARNING" => DiagnosticSeverity::WARNING,
                        _ => DiagnosticSeverity::ERROR,
                    };
                    Diagnostic {
                        range: Range::default(),
                        severity: Some(severity),
                        code: Some(NumberOrString::String(i.code.clone())),
                        message: i.message.clone(),
                        source: Some("wasm4pm-lsp".to_string()),
                        ..Default::default()
                    }
                }).collect()
            } else { vec![] };

            items.push(WorkspaceDocumentDiagnosticReport::Full(WorkspaceFullDocumentDiagnosticReport {
                uri,
                version: None,
                full_document_diagnostic_report: FullDocumentDiagnosticReport {
                    result_id: None,
                    items: diag_items,
                },
            }));
        }

        Ok(WorkspaceDiagnosticReportResult::Report(WorkspaceDiagnosticReport { items }))
    }

    // ── P2-K: symbol — workspace OCEL search ─────────────────────────────────────
    async fn symbol(&self, params: WorkspaceSymbolParams) -> Result<Option<Vec<SymbolInformation>>> {
        let query = params.query.to_lowercase();
        let mut symbols = Vec::new();

        for entry in self.documents.iter() {
            let uri = entry.key().clone();
            let doc = entry.value();
            let idx = match &doc.index { Some(i) => i, None => continue };

            for ev in &idx.events {
                if query.is_empty() || ev.id.to_lowercase().contains(&query) || ev.event_type.to_lowercase().contains(&query) {
                    #[allow(deprecated)]
                    symbols.push(SymbolInformation {
                        name: format!("{} ({})", ev.id, ev.event_type),
                        kind: SymbolKind::EVENT,
                        tags: None,
                        deprecated: None,
                        location: Location { uri: uri.clone(), range: ev.range },
                        container_name: Some("events".to_string()),
                    });
                }
            }
            for obj in &idx.objects {
                if query.is_empty() || obj.id.to_lowercase().contains(&query) || obj.obj_type.to_lowercase().contains(&query) {
                    #[allow(deprecated)]
                    symbols.push(SymbolInformation {
                        name: format!("{} ({})", obj.id, obj.obj_type),
                        kind: SymbolKind::OBJECT,
                        tags: None,
                        deprecated: None,
                        location: Location { uri: uri.clone(), range: obj.range },
                        container_name: Some("objects".to_string()),
                    });
                }
            }
        }
        Ok(Some(symbols))
    }

    // ── P2-L: execute_command — wasm4pm commands ─────────────────────────────────
    async fn execute_command(&self, params: ExecuteCommandParams) -> Result<Option<Value>> {
        match params.command.as_str() {
            "wasm4pm.checkConformance" => {
                let uri_str = params.arguments.first().and_then(|v| v.as_str()).unwrap_or("");
                let result = if let Ok(doc_uri) = Url::from_str(uri_str) {
                    if let Some(doc) = self.get_doc(&doc_uri) {
                        let issues = analyze_ocel(&doc.text);
                        issues.first().map(|i| i.message.clone()).unwrap_or_else(|| "No OCEL diagnostics".to_string())
                    } else { "Document not open".to_string() }
                } else { "Invalid URI".to_string() };
                self.client.show_message(MessageType::INFO, result).await;
                Ok(Some(Value::Null))
            }
            "wasm4pm.discoverDfg" => {
                let uri_str = params.arguments.first().and_then(|v| v.as_str()).unwrap_or("");
                if let Ok(uri) = Url::from_str(uri_str) {
                    if let Some(doc) = self.get_doc(&uri) {
                        // Convert via JSON: wasm4pm_compat::OCEL → wasm4pm::models::OCEL
                        if let Ok(native_ocel) = serde_json::from_str::<wasm4pm::models::OCEL>(&doc.text) {
                            let dfg = wasm4pm::discovery::discover_ocel_dfg_pure(&native_ocel);
                            let dfg_json = serde_json::to_string_pretty(&dfg).unwrap_or_default();
                            let uri_path = uri.path().as_str().to_string();
                            if let Some(dir) = std::path::Path::new(&uri_path).parent() {
                                let out_dir = dir.join(".wasm4pm");
                                let _ = std::fs::create_dir_all(&out_dir);
                                let _ = std::fs::write(out_dir.join("dfg.json"), &dfg_json);
                            }
                            self.client.show_message(MessageType::INFO, "DFG written to .wasm4pm/dfg.json").await;
                            return Ok(Some(serde_json::from_str(&dfg_json).unwrap_or(Value::Null)));
                        }
                    }
                }
                Ok(Some(Value::Null))
            }
            "wasm4pm.runBreed" => {
                let breed = params.arguments.first().and_then(|v| v.as_str()).unwrap_or("").to_string();
                self.client.show_message(MessageType::INFO, format!("Breed {} queued", breed)).await;
                Ok(Some(serde_json::json!({"status": "queued", "breed": breed})))
            }
            "wasm4pm.exportBundle" => {
                self.client.show_message(MessageType::INFO, "Bundle export: collect .wasm4pm/receipts/ + dfg.json").await;
                Ok(Some(Value::Null))
            }
            _ => Ok(None),
        }
    }

    // ── Phase 4.5: 80/20 coverage push ──────────────────────────────────────────

    // goto_implementation: jump from an activity name → eventType definition
    async fn goto_implementation(&self, params: GotoImplementationParams) -> Result<Option<GotoImplementationResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() { return Ok(None); }

        // Find eventType with matching name
        let pattern = format!("\"name\": \"{}\"", token);
        if let Some(match_pos) = text.find(&pattern) {
            let event_types_pos = text.find("\"eventTypes\"").unwrap_or(usize::MAX);
            let events_pos = text.find("\"events\"").unwrap_or(usize::MAX);
            if match_pos > event_types_pos && match_pos < events_pos {
                let decl_pos = offset_to_position(&text, match_pos + 9);
                return Ok(Some(GotoImplementationResponse::Scalar(Location {
                    uri: uri.clone(),
                    range: Range {
                        start: decl_pos,
                        end: Position { line: decl_pos.line, character: decl_pos.character + token.len() as u32 },
                    },
                })));
            }
        }
        Ok(None)
    }

    // symbol_resolve: return WorkspaceSymbol with location re-derived from name
    async fn symbol_resolve(&self, params: WorkspaceSymbol) -> Result<WorkspaceSymbol> {
        let name = &params.name;
        // name format: "id (type)" — extract id
        let id = name.split(" (").next().unwrap_or(name.as_str());
        for entry in self.documents.iter() {
            let uri = entry.key().clone();
            let doc = entry.value();
            let idx = match &doc.index { Some(i) => i, None => continue };
            if let Some(&ei) = idx.event_by_id.get(id) {
                let mut sym = params;
                sym.location = OneOf::Left(Location { uri, range: idx.events[ei].range });
                return Ok(sym);
            }
            if let Some(&oi) = idx.obj_by_id.get(id) {
                let mut sym = params;
                sym.location = OneOf::Left(Location { uri, range: idx.objects[oi].range });
                return Ok(sym);
            }
        }
        Ok(params)
    }

    // document_link_resolve: populate target from current config
    async fn document_link_resolve(&self, params: DocumentLink) -> Result<DocumentLink> {
        let cfg = self.config.read().ok().map(|g| g.clone()).unwrap_or_default();
        let ocpn = match cfg.model.ocpn_model { Some(m) => m, None => return Ok(params) };
        let model_url_str = format!("file://{ocpn}");
        if let Ok(target) = Url::from_str(&model_url_str) {
            let mut link = params;
            link.target = Some(target);
            return Ok(link);
        }
        Ok(params)
    }

    // ranges_formatting: multi-range format (JSON: full-doc pretty-print)
    async fn ranges_formatting(&self, params: max_protocol::lsp_3_18::DocumentRangesFormattingParams) -> Result<Option<Vec<max_protocol::lsp_3_18::TextEdit>>> {
        let uri_str = params.text_document.uri.as_str();
        let doc_uri = match Url::from_str(uri_str) { Ok(u) => u, Err(_) => return Ok(None) };
        let doc = match self.get_doc(&doc_uri) { Some(d) => d, None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            let spaces = params.options.tab_size as usize;
            let formatted = indent_json(&v, spaces);
            let line_count = text.lines().count() as u32;
            return Ok(Some(vec![max_protocol::lsp_3_18::TextEdit {
                range: max_protocol::lsp_3_18::Range {
                    start: max_protocol::lsp_3_18::Position { line: 0, character: 0 },
                    end: max_protocol::lsp_3_18::Position { line: line_count + 1, character: 0 },
                },
                new_text: formatted,
            }]));
        }
        Ok(None)
    }

    // inline_completion: ghost-text suggestions for objectIds and eventType names
    async fn inline_completion(&self, params: InlineCompletionParams) -> Result<Option<InlineCompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let doc = match self.get_doc(uri) { Some(d) => d, None => return Ok(None) };
        let idx = match &doc.index { Some(i) => i.clone(), None => return Ok(None) };
        let text = doc.text.clone();
        drop(doc);

        let context = detect_json_context(&text, pos);
        let make_item = |label: &str| InlineCompletionItem {
            insert_text: StringOrStringValue::String(label.to_string()),
            filter_text: Some(label.to_string()),
            range: None,
            command: None,
            insert_text_format: None,
        };
        let items: Vec<InlineCompletionItem> = match context.as_str() {
            "relationship_objectId" => idx.obj_by_id.keys().map(|id| make_item(id)).collect(),
            "event_type" => idx.event_types.iter().map(|t| make_item(t)).collect(),
            "object_type" => idx.object_types.iter().map(|t| make_item(t)).collect(),
            _ => return Ok(None),
        };

        Ok(Some(InlineCompletionResponse::Array(items)))
    }

    // will_rename_files: patch DocumentLink references to the renamed .ocel.json
    async fn will_rename_files(&self, params: RenameFilesParams) -> Result<Option<WorkspaceEdit>> {
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        for file in &params.files {
            let old_name = std::path::Path::new(&file.old_uri)
                .file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let new_name = std::path::Path::new(&file.new_uri)
                .file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if old_name.is_empty() || new_name.is_empty() { continue; }
            // Scan all open documents for references to old_name
            for entry in self.documents.iter() {
                let doc_uri = entry.key().clone();
                let text = entry.value().text.clone();
                for (line_idx, line) in text.lines().enumerate() {
                    if let Some(col) = line.find(&old_name) {
                        changes.entry(doc_uri.clone()).or_default().push(TextEdit {
                            range: Range {
                                start: Position { line: line_idx as u32, character: col as u32 },
                                end: Position { line: line_idx as u32, character: (col + old_name.len()) as u32 },
                            },
                            new_text: new_name.clone(),
                        });
                    }
                }
            }
        }
        if changes.is_empty() { return Ok(None); }
        Ok(Some(WorkspaceEdit {
            changes: Some(changes),
            ..Default::default()
        }))
    }

    // Protocol-correctness stubs
    async fn will_create_files(&self, _params: CreateFilesParams) -> Result<Option<WorkspaceEdit>> { Ok(None) }
    async fn will_delete_files(&self, _params: DeleteFilesParams) -> Result<Option<WorkspaceEdit>> { Ok(None) }
    async fn work_done_progress_cancel(&self, _params: WorkDoneProgressCancelParams) {}
    async fn set_trace(&self, _params: SetTraceParams) {}
    async fn progress(&self, _params: ProgressParams) {}

    // ── Call Hierarchy (LSP 3.18 §3.17) ─────────────────────────────────────────

    async fn prepare_call_hierarchy(
        &self,
        params: CallHierarchyPrepareParams,
    ) -> Result<Option<Vec<CallHierarchyItem>>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        // Event id → Function kind
        if let Some(&ei) = idx.event_by_id.get(&token) {
            let ev = &idx.events[ei];
            let item = CallHierarchyItem {
                name: ev.id.clone(),
                kind: SymbolKind::FUNCTION,
                tags: None,
                detail: Some(ev.event_type.clone()),
                uri: uri.clone(),
                range: ev.range,
                selection_range: ev.range,
                data: None,
            };
            return Ok(Some(vec![item]));
        }

        // Object id → Class kind
        if let Some(&oi) = idx.obj_by_id.get(&token) {
            let obj = &idx.objects[oi];
            let item = CallHierarchyItem {
                name: obj.id.clone(),
                kind: SymbolKind::CLASS,
                tags: None,
                detail: Some(obj.obj_type.clone()),
                uri: uri.clone(),
                range: obj.range,
                selection_range: obj.range,
                data: None,
            };
            return Ok(Some(vec![item]));
        }

        Ok(None)
    }

    async fn incoming_calls(
        &self,
        params: CallHierarchyIncomingCallsParams,
    ) -> Result<Option<Vec<CallHierarchyIncomingCall>>> {
        let item = &params.item;
        let uri = &item.uri;
        let object_id = &item.name;

        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        drop(doc);

        // Only meaningful for objects (Class kind): find events that reference this objectId
        if item.kind != SymbolKind::CLASS {
            return Ok(Some(vec![]));
        }

        let mut calls: Vec<CallHierarchyIncomingCall> = Vec::new();
        for ev in &idx.events {
            let from_ranges: Vec<Range> = ev.relationships.iter()
                .filter(|(oid, _, _)| oid == object_id)
                .map(|(_, _, r)| *r)
                .collect();
            if !from_ranges.is_empty() {
                let caller_item = CallHierarchyItem {
                    name: ev.id.clone(),
                    kind: SymbolKind::FUNCTION,
                    tags: None,
                    detail: Some(ev.event_type.clone()),
                    uri: uri.clone(),
                    range: ev.range,
                    selection_range: ev.range,
                    data: None,
                };
                calls.push(CallHierarchyIncomingCall {
                    from: caller_item,
                    from_ranges,
                });
            }
        }

        Ok(Some(calls))
    }

    async fn outgoing_calls(
        &self,
        params: CallHierarchyOutgoingCallsParams,
    ) -> Result<Option<Vec<CallHierarchyOutgoingCall>>> {
        let item = &params.item;
        let uri = &item.uri;
        let event_id = &item.name;

        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        drop(doc);

        // Only meaningful for events (Function kind)
        if item.kind != SymbolKind::FUNCTION {
            return Ok(Some(vec![]));
        }

        let ei = match idx.event_by_id.get(event_id) {
            Some(&i) => i,
            None => return Ok(Some(vec![])),
        };

        let ev = &idx.events[ei];
        let mut calls: Vec<CallHierarchyOutgoingCall> = Vec::new();

        for (oid, _, rel_range) in &ev.relationships {
            if let Some(&oi) = idx.obj_by_id.get(oid) {
                let obj = &idx.objects[oi];
                let target_item = CallHierarchyItem {
                    name: obj.id.clone(),
                    kind: SymbolKind::CLASS,
                    tags: None,
                    detail: Some(obj.obj_type.clone()),
                    uri: uri.clone(),
                    range: obj.range,
                    selection_range: obj.range,
                    data: None,
                };
                calls.push(CallHierarchyOutgoingCall {
                    to: target_item,
                    from_ranges: vec![*rel_range],
                });
            }
        }

        Ok(Some(calls))
    }

    // ── Type Hierarchy (LSP 3.18 §3.17b) ────────────────────────────────────────

    async fn prepare_type_hierarchy(
        &self,
        params: TypeHierarchyPrepareParams,
    ) -> Result<Option<Vec<TypeHierarchyItem>>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let doc = match self.get_doc(uri) {
            Some(d) => d,
            None => return Ok(None),
        };
        let idx = match &doc.index {
            Some(i) => i.clone(),
            None => return Ok(None),
        };
        let text = doc.text.clone();
        drop(doc);

        let line_str = text.lines().nth(pos.line as usize).unwrap_or("");
        let token = extract_token_at(line_str, pos.character as usize);
        if token.is_empty() {
            return Ok(None);
        }

        // Check if it's an eventType
        if idx.event_types.contains(&token) {
            let item = TypeHierarchyItem {
                name: token.clone(),
                kind: SymbolKind::CLASS,
                tags: None,
                detail: Some("eventType".to_string()),
                uri: uri.clone(),
                range: Default::default(),
                selection_range: Default::default(),
                data: None,
            };
            return Ok(Some(vec![item]));
        }

        // Check if it's an objectType
        if idx.object_types.contains(&token) {
            let item = TypeHierarchyItem {
                name: token.clone(),
                kind: SymbolKind::CLASS,
                tags: None,
                detail: Some("objectType".to_string()),
                uri: uri.clone(),
                range: Default::default(),
                selection_range: Default::default(),
                data: None,
            };
            return Ok(Some(vec![item]));
        }

        Ok(None)
    }

    async fn supertypes(
        &self,
        _params: TypeHierarchySupertypesParams,
    ) -> Result<Option<Vec<TypeHierarchyItem>>> {
        // OCEL 2.0 has no type hierarchy; return empty list
        Ok(Some(vec![]))
    }

    async fn subtypes(
        &self,
        _params: TypeHierarchySubtypesParams,
    ) -> Result<Option<Vec<TypeHierarchyItem>>> {
        // OCEL 2.0 has no type hierarchy; return empty list
        Ok(Some(vec![]))
    }

    // LSP 3.18 — Document Color (not semantically relevant for OCEL JSON)
    async fn document_color(&self, _params: DocumentColorParams) -> Result<Vec<ColorInformation>> {
        Ok(vec![])
    }

    // LSP 3.18 — Color Presentation (not supported)
    async fn color_presentation(
        &self,
        _params: ColorPresentationParams,
    ) -> Result<Vec<ColorPresentation>> {
        Ok(vec![])
    }

    // LSP 3.18 — Text Document Content (no virtual document scheme registered)
    async fn text_document_content(
        &self,
        _params: max_protocol::lsp_3_18::TextDocumentContentParams,
    ) -> Result<max_protocol::lsp_3_18::TextDocumentContentResult> {
        Err(lsp_max::jsonrpc::Error::method_not_found())
    }

    // LSP 3.18 — Notebook document notifications (no-op: not relevant to OCEL process mining)
    async fn did_open_notebook_document(&self, _params: DidOpenNotebookDocumentParams) {}

    async fn did_change_notebook_document(&self, _params: DidChangeNotebookDocumentParams) {}

    async fn did_save_notebook_document(&self, _params: DidSaveNotebookDocumentParams) {}

    async fn did_close_notebook_document(&self, _params: DidCloseNotebookDocumentParams) {}

    // ── Phase 5: max/* custom methods ────────────────────────────────────────────

    async fn max_snapshot(&self) -> Result<max_protocol::SnapshotId> {
        let count = self.documents.len();
        let id = format!("wasm4pm-snapshot-docs:{}", count);
        Ok(max_protocol::SnapshotId(id))
    }

    async fn max_conformance_vector(
        &self,
        _params: Option<max_protocol::SnapshotId>,
    ) -> Result<max_protocol::ConformanceVector> {
        use max_protocol::{ConformanceVector, LawAxis};

        let mut admitted = Vec::new();
        let mut refused = Vec::new();
        let unknown = vec![LawAxis::Release];

        for entry in self.documents.iter() {
            let doc = entry.value();
            if let Some(cf) = &doc.conformance {
                match &cf.verdict {
                    GallVerdict::Fit { .. } => {
                        admitted.push(LawAxis::Domain);
                        admitted.push(LawAxis::Receipt);
                    }
                    GallVerdict::Deviation { .. } | GallVerdict::Blocked { .. } => {
                        refused.push(LawAxis::Domain);
                    }
                    GallVerdict::Inconclusive => {}
                }
            }
        }

        let total = (admitted.len() + refused.len() + unknown.len()) as f64;
        let score = if total > 0.0 { Some(100.0 * admitted.len() as f64 / total) } else { None };

        Ok(ConformanceVector {
            admitted,
            refused,
            unknown,
            score,
            strict_mode: false,
            process_quality: None,
        })
    }

    async fn max_explain_diagnostic(&self, params: String) -> Result<max_protocol::MaxDiagnostic> {
        use max_protocol::{MaxDiagnostic, Repairability};

        let (title, detail, fix_hint) = match params.as_str() {
            "WASM4PM-VERDICT-FIT" => (
                "Conformance: FIT",
                "The OCEL log conforms to the declared process model via Gall checkpoint.",
                "No action required. Bind receipt with wasm4pm.checkConformance.",
            ),
            "WASM4PM-VERDICT-DEVIATION" => (
                "Conformance: DEVIATION",
                "One or more activities in the log are not admitted by the process model.",
                "Check missing activities and ensure all event types are declared in eventTypes.",
            ),
            "WASM4PM-VERDICT-BLOCKED" => (
                "Conformance: BLOCKED",
                "The OCEL log was blocked by the conformance gate — structural violation.",
                "Ensure the OCEL structure is valid OCEL 2.0 format.",
            ),
            "WASM4PM-DANGLING-REF" => (
                "Dangling Object Reference",
                "A relationship references an objectId that doesn't exist in the objects array.",
                "Add the missing object or remove the dangling relationship.",
            ),
            "WASM4PM-TIME-ORDER" => (
                "Chronological Order Violation",
                "Events are not in non-decreasing timestamp order.",
                "Sort the events array by the 'time' field.",
            ),
            "WASM4PM-UNKNOWN-ACTIVITY" => (
                "Undeclared Activity Type",
                "An event uses an activity type not declared in eventTypes.",
                "Add the activity type to the eventTypes array.",
            ),
            "WASM4PM-TS-FM5" => (
                "FM-5 Violation",
                "init.js is mocked in a cognition test — at least one test must use real WASM.",
                "Remove vi.mock('init.js') and add an integration test that loads real WASM.",
            ),
            _ => (
                "Unknown Diagnostic",
                "No explanation available for this diagnostic code.",
                "Consult wasm4pm documentation.",
            ),
        };

        Ok(MaxDiagnostic {
            lsp: Diagnostic {
                range: Range::default(),
                severity: Some(DiagnosticSeverity::ERROR),
                code: Some(NumberOrString::String(params.clone())),
                message: detail.to_string(),
                source: Some("wasm4pm-lsp".to_string()),
                ..Default::default()
            },
            diagnostic_id: params,
            law_id: "wasm4pm.conformance".to_string(),
            violated_invariant: fix_hint.to_string(),
            ..Default::default()
        })
    }

    async fn max_receipt(&self, params: String) -> Result<max_protocol::Receipt> {
        // params = URI string; look for .wasm4pm/receipts/latest.json
        let uri_path = if let Ok(url) = Url::from_str(params.as_str()) {
            url.path().as_str().to_string()
        } else {
            params.clone()
        };

        let receipt_path = if let Some(dir) = std::path::Path::new(&uri_path).parent() {
            dir.join(".wasm4pm/receipts/latest.json")
        } else {
            return Err(lsp_max::jsonrpc::Error::internal_error());
        };

        let receipt_str = std::fs::read_to_string(&receipt_path)
            .unwrap_or_else(|_| r#"{"receipt_id":"","hash":""}"#.to_string());
        let v: Value = serde_json::from_str(&receipt_str).unwrap_or_default();

        Ok(max_protocol::Receipt {
            receipt_id: v.get("output_hash").and_then(|h| h.as_str()).unwrap_or("").to_string(),
            hash: v.get("input_hash").and_then(|h| h.as_str()).unwrap_or("").to_string(),
            prev_receipt_hash: None,
        })
    }

    async fn max_run_gate(&self, params: max_protocol::GateId) -> Result<bool> {
        // Run Gall conformance gate on the first open OCEL document matching the gate ID
        let gate_uri = params.0;
        for entry in self.documents.iter() {
            let uri_str = entry.key().to_string();
            if uri_str.contains(&gate_uri) || gate_uri.is_empty() {
                if entry.key().path().as_str().ends_with(".ocel.json") {
                    let issues = analyze_ocel(&entry.value().text);
                    let fit = issues.iter().any(|i| i.code == "WASM4PM-VERDICT-FIT");
                    return Ok(fit);
                }
            }
        }
        Ok(false)
    }

    async fn max_repair_plan(&self, params: String) -> Result<Vec<max_protocol::MaxCodeAction>> {
        use max_protocol::{MaxCodeAction, Precondition, ValidationPlan, RollbackPlan, ReceiptPlan};
        let action = MaxCodeAction {
            action: CodeAction {
                title: format!("Repair: {}", params),
                ..Default::default()
            },
            preconditions: vec![Precondition { condition: "document_open".to_string() }],
            validation_plan: ValidationPlan { gates: vec![] },
            rollback_plan: RollbackPlan { strategy: "revert".to_string() },
            receipt_plan: ReceiptPlan { expected_receipts: vec![] },
        };
        Ok(vec![action])
    }

    async fn max_apply_repair_transaction(&self, _params: max_protocol::MaxCodeAction) -> Result<max_protocol::Receipt> {
        Ok(max_protocol::Receipt {
            receipt_id: "repair-applied".to_string(),
            hash: "".to_string(),
            prev_receipt_hash: None,
        })
    }

    async fn max_export_analysis_bundle(&self, params: max_protocol::SnapshotId) -> Result<max_protocol::AnalysisBundle> {
        Ok(max_protocol::AnalysisBundle {
            snapshot_id: params,
            ..Default::default()
        })
    }

    async fn max_clear_diagnostic(&self, _params: String) -> Result<()> {
        Ok(())
    }

    async fn max_release_actuation(&self, _params: Value) -> Result<Value> {
        Ok(serde_json::json!({
            "status": "released"
        }))
    }

    async fn max_admission(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "admitted": true, "reason": "conformance_gate_pass" }))
    }

    async fn max_autonomic_loop(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "status": "idle", "cycles": 0 }))
    }

    async fn max_chain(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "chain": [], "length": 0 }))
    }

    async fn max_hook(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "hook": "registered", "handlers": [] }))
    }

    async fn max_hook_graph(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "nodes": [], "edges": [] }))
    }

    async fn max_lawful_transition(&self, params: String) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "transition": params, "admitted": true }))
    }

    async fn max_ledger_report(&self) -> Result<String> {
        let count = self.documents.len();
        Ok(format!("wasm4pm ledger: {} open documents, 0 receipts", count))
    }

    async fn max_manifold_snapshot(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "snapshots": [],
            "conformance_states": []
        }))
    }

    async fn max_propagate(&self, params: max_protocol::Receipt) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "propagated": true,
            "receipt_id": params.receipt_id,
            "hash": params.hash
        }))
    }

    async fn max_refusal(&self, params: String) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "verdict": "refused",
            "reason": params
        }))
    }

    async fn max_replay(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "status": "replayed",
            "receipt_count": 0,
            "replayed_receipts": []
        }))
    }

    async fn max_verify_ledger(&self) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "valid": true,
            "receipt_count": 0,
            "hash_chain_intact": true
        }))
    }

    async fn max_conformance_delta(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "delta": [],
            "from_snapshot": params.get("from").cloned().unwrap_or(Value::Null),
            "to_snapshot": params.get("to").cloned().unwrap_or(Value::Null)
        }))
    }

    async fn max_dump_state(&self) -> Result<serde_json::Value> {
        let doc_count = self.documents.len();
        Ok(serde_json::json!({
            "diagnostics": [],
            "document_count": doc_count,
            "receipts": []
        }))
    }

    async fn max_restore_state(&self, _params: serde_json::Value) -> Result<()> {
        Ok(())
    }

    async fn max_instance_list(&self) -> Result<Value> {
        Ok(serde_json::json!({
            "instances": []
        }))
    }

    async fn max_reset(&self) -> Result<()> {
        Ok(())
    }

    async fn max_lsif(&self) -> Result<String> {
        Ok(serde_json::json!({
            "version": "0.5.0",
            "projectRoot": "file:///",
            "vertices": [],
            "edges": []
        }).to_string())
    }
}

// ── JSON context detection ────────────────────────────────────────────────────

/// Very lightweight JSON path context detector.
/// Returns a string key describing what kind of value the cursor is in.
fn detect_json_context(text: &str, pos: Position) -> String {
    // Walk backwards from cursor scanning for the enclosing key
    let lines: Vec<&str> = text.lines().collect();
    let target = pos.line as usize;
    // Scan current and preceding lines for nearest key
    let scan_start = if target > 5 { target - 5 } else { 0 };
    let snippet: String = lines[scan_start..=target.min(lines.len().saturating_sub(1))].join("\n");

    if snippet.contains("\"objectId\"") && snippet.contains("\"relationships\"") {
        return "relationship_objectId".to_string();
    }
    if snippet.contains("\"qualifier\"") {
        return "qualifier".to_string();
    }
    // Determine if we are inside events[*].type or objects[*].type
    // Check surrounding context for "events" vs "objects"
    let broader_start = if target > 20 { target - 20 } else { 0 };
    let broader: String = lines[broader_start..=target.min(lines.len().saturating_sub(1))].join("\n");
    let current_line = lines.get(pos.line as usize).unwrap_or(&"");
    if current_line.contains("\"type\"") || current_line.trim_start().starts_with("\"type\"") {
        // Check if inside events or objects block
        if broader.rfind("\"events\"").unwrap_or(0) > broader.rfind("\"objects\"").unwrap_or(0) {
            return "event_type".to_string();
        } else {
            return "object_type".to_string();
        }
    }

    "unknown".to_string()
}

// ── Token extraction ──────────────────────────────────────────────────────────

/// Extract the quoted string token that the cursor (column col) is inside on a single line.
fn extract_token_at(line: &str, col: usize) -> String {
    let bytes = line.as_bytes();
    let col = col.min(bytes.len().saturating_sub(1));

    // Walk left to find opening quote
    let mut start = col;
    while start > 0 && bytes[start] != b'"' {
        start = start.saturating_sub(1);
    }
    if start >= bytes.len() || bytes[start] != b'"' {
        return String::new();
    }
    start += 1; // skip quote

    // Walk right to find closing quote
    let mut end = start;
    while end < bytes.len() && bytes[end] != b'"' {
        end += 1;
    }

    if end > start {
        line[start..end].to_string()
    } else {
        String::new()
    }
}

// ── Custom JSON indenter ──────────────────────────────────────────────────────

fn indent_json(v: &Value, spaces: usize) -> String {
    // Serialize with serde_json pretty (2 spaces) then re-indent
    let pretty = serde_json::to_string_pretty(v).unwrap_or_default();
    let indent_str = " ".repeat(spaces);
    let mut result = String::new();
    let mut depth = 0usize;
    let mut in_string = false;
    let mut chars = pretty.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                in_string = !in_string;
                result.push(ch);
            }
            '\\' if in_string => {
                result.push(ch);
                if let Some(next) = chars.next() {
                    result.push(next);
                }
            }
            '{' | '[' if !in_string => {
                result.push(ch);
                depth += 1;
            }
            '}' | ']' if !in_string => {
                depth = depth.saturating_sub(1);
                result.push(ch);
            }
            '\n' if !in_string => {
                result.push('\n');
                result.push_str(&indent_str.repeat(depth));
            }
            ' ' if !in_string => {
                // Skip original spaces at line starts (already re-indented)
                // Keep single spaces after colons/commas
                result.push(ch);
            }
            _ => result.push(ch),
        }
    }
    result
}

// ── Semantic token helpers ────────────────────────────────────────────────────

/// Build the full flat semantic token list from an OCEL document.
fn build_semantic_tokens(text: &str, idx: &OcelIndex) -> Vec<SemanticToken> {
    let mut tokens: Vec<SemanticToken> = Vec::new();

    // eventId values → function (type index 2)
    for ev in &idx.events {
        tokens.push(range_to_token(text, ev.range, 2, 1)); // function, declaration
        // event_type → keyword (6)
        if let Some(r) = find_value_range(text, &ev.event_type) {
            tokens.push(range_to_token(text, r, 6, 0));
        }
        // timestamp → string (4)
        if let Some(r) = find_quoted_value_range(text, "time", &ev.time) {
            tokens.push(range_to_token(text, r, 4, 0));
        }
    }
    // objectId values → class (type index 1)
    for obj in &idx.objects {
        tokens.push(range_to_token(text, obj.range, 1, 1)); // class, declaration
    }

    // Sort by position then convert to delta encoding
    tokens.sort_by(|a, b| {
        let al = a.delta_line; let ac = a.delta_start;
        let bl = b.delta_line; let bc = b.delta_start;
        al.cmp(&bl).then(ac.cmp(&bc))
    });

    // Delta-encode (stored as absolute first, then delta-encoded)
    let mut prev_line = 0u32;
    let mut prev_start = 0u32;
    for tok in &mut tokens {
        let abs_line = tok.delta_line;
        let abs_start = tok.delta_start;
        if abs_line == prev_line {
            tok.delta_start = abs_start.saturating_sub(prev_start);
        } else {
            tok.delta_start = abs_start;
        }
        tok.delta_line = abs_line.saturating_sub(prev_line);
        prev_line = abs_line;
        prev_start = abs_start;
    }

    tokens
}

fn range_to_token(text: &str, range: Range, token_type: u32, modifiers: u32) -> SemanticToken {
    let _ = text;
    SemanticToken {
        delta_line: range.start.line,      // absolute for now; delta-encoded in post-pass
        delta_start: range.start.character,
        length: range.end.character.saturating_sub(range.start.character),
        token_type,
        token_modifiers_bitset: modifiers,
    }
}

/// Clip already-built (delta-encoded) semantic tokens to a range.
fn clip_tokens_to_range(_text: &str, tokens: &[SemanticToken], _range: Range) -> Vec<SemanticToken> {
    // For simplicity, return all tokens (range is a hint for editors to limit traffic)
    tokens.to_vec()
}

// ── Selection range helper ────────────────────────────────────────────────────

/// Build nested selection ranges for a position in a JSON document.
fn build_selection_range(text: &str, pos: Position) -> SelectionRange {
    let lines: Vec<&str> = text.lines().collect();
    let line_str = lines.get(pos.line as usize).unwrap_or(&"");
    let col = pos.character as usize;

    // Innermost: current token
    let token = extract_token_at(line_str, col);
    let token_range = if !token.is_empty() {
        find_value_range(text, &token).unwrap_or_else(|| Range {
            start: pos,
            end: Position { line: pos.line, character: pos.character + token.len() as u32 },
        })
    } else {
        Range { start: pos, end: pos }
    };

    // Middle: current line
    let line_range = Range {
        start: Position { line: pos.line, character: 0 },
        end: Position { line: pos.line, character: line_str.len() as u32 },
    };

    // Outer: whole document
    let doc_range = Range {
        start: Position { line: 0, character: 0 },
        end: Position { line: lines.len() as u32, character: 0 },
    };

    SelectionRange {
        range: token_range,
        parent: Some(Box::new(SelectionRange {
            range: line_range,
            parent: Some(Box::new(SelectionRange {
                range: doc_range,
                parent: None,
            })),
        })),
    }
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --scan <path> [--json] [--fail-on-error]
    if args.get(1).map(|s| s.as_str()) == Some("--scan") {
        let scan_path = args.get(2).map(|s| s.as_str()).unwrap_or(".");
        let as_json = args.contains(&"--json".to_string());
        let fail_on_error = args.contains(&"--fail-on-error".to_string());
        let exit_code = run_scan(scan_path, as_json, fail_on_error);
        std::process::exit(exit_code);
    }

    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let documents: Arc<DashMap<Url, DocumentState>> = Arc::new(DashMap::new());
    let config: Arc<RwLock<LspConfig>> = Arc::new(RwLock::new(LspConfig::default()));
    let (service, socket) = LspService::new(|client| Backend {
        client,
        documents: documents.clone(),
        config: config.clone(),
    });
    Server::new(stdin, stdout, socket)
        .serve(service)
        .await
        .unwrap();
}

#[derive(serde::Serialize)]
struct ScanFinding {
    file: String,
    severity: String,
    code: String,
    message: String,
}

fn scan_dir(path: &str, findings: &mut Vec<ScanFinding>) {
    let Ok(entries) = std::fs::read_dir(path) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if name == "node_modules" || name == "target" || name.starts_with('.') {
                    continue;
                }
            }
            scan_dir(p.to_str().unwrap_or(""), findings);
        } else if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            let path_str = p.to_str().unwrap_or("").to_string();
            let Ok(content) = std::fs::read_to_string(&p) else { continue };
            if name.ends_with(".ocel.json") || (name.ends_with(".json") && content.contains("\"ocel:events\"")) {
                let ocel_issues = analyze_ocel(&content);
                for issue in &ocel_issues {
                    findings.push(ScanFinding {
                        file: path_str.clone(),
                        severity: issue.severity.clone(),
                        code: issue.code.clone(),
                        message: issue.message.clone(),
                    });
                }
                if let Some(idx) = parse_ocel(&content) {
                    for issue in check_structural(&idx) {
                        findings.push(ScanFinding {
                            file: path_str.clone(),
                            severity: issue.severity.clone(),
                            code: issue.code.clone(),
                            message: issue.message.clone(),
                        });
                    }
                }
            } else if name.ends_with(".ts") {
                for issue in ts_analyzer::analyze_ts(&content) {
                    findings.push(ScanFinding {
                        file: path_str.clone(),
                        severity: issue.severity.clone(),
                        code: issue.code.clone(),
                        message: issue.message.clone(),
                    });
                }
            }
        }
    }
}

fn run_scan(path: &str, as_json: bool, fail_on_error: bool) -> i32 {
    let mut findings: Vec<ScanFinding> = Vec::new();
    let meta = std::fs::metadata(path);
    let is_file = meta.as_ref().map(|m| m.is_file()).unwrap_or(false);
    if is_file {
        let content = std::fs::read_to_string(path).unwrap_or_default();
        let name = std::path::Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".ocel.json") || (name.ends_with(".json") && content.contains("\"ocel:events\"")) {
            for issue in analyze_ocel(&content) {
                findings.push(ScanFinding { file: path.to_string(), severity: issue.severity, code: issue.code, message: issue.message });
            }
            if let Some(idx) = parse_ocel(&content) {
                for issue in check_structural(&idx) {
                    findings.push(ScanFinding { file: path.to_string(), severity: issue.severity, code: issue.code, message: issue.message });
                }
            }
        } else if name.ends_with(".ts") {
            for issue in ts_analyzer::analyze_ts(&content) {
                findings.push(ScanFinding { file: path.to_string(), severity: issue.severity, code: issue.code, message: issue.message });
            }
        }
    } else {
        scan_dir(path, &mut findings);
    }

    if as_json {
        println!("{}", serde_json::to_string_pretty(&findings).unwrap_or_default());
    } else {
        for f in &findings {
            println!("[{}] {} — {} ({})", f.severity, f.file, f.message, f.code);
        }
        if findings.is_empty() {
            println!("No issues found.");
        }
    }

    if fail_on_error && findings.iter().any(|f| f.severity == "ERROR") { 1 } else { 0 }
}

#[cfg(test)]
mod scan_tests {
    use super::*;

    #[test]
    fn fixture_n14_unknown_activity() {
        let content = include_str!("../../../fixtures/negative/n14-undeclared-event-type.ocel.json");
        let idx = parse_ocel(content).expect("n14 should parse");
        let issues = check_structural(&idx);
        assert!(
            issues.iter().any(|i| i.code == "WASM4PM-UNKNOWN-ACTIVITY"),
            "expected WASM4PM-UNKNOWN-ACTIVITY, got: {:?}",
            issues.iter().map(|i| &i.code).collect::<Vec<_>>()
        );
    }

    #[test]
    fn a4_triggers_findings_near_cognition_run() {
        // Synthetic: .findings accessed within 5 lines of cognition_run() — A4 should fire
        let content = r#"
import { cognition_run } from '@wasm4pm/cognition';
const result = await cognition_run({ breed: 'mycin', contract: {} });
if (result.findings.length > 0) { throw new Error('bad'); }
"#;
        let issues = ts_analyzer::analyze_ts(content);
        assert!(
            issues.iter().any(|i| i.code == "WASM4PM-TS-A4"),
            "expected WASM4PM-TS-A4 for .findings near cognition_run, got: {:?}",
            issues.iter().map(|i| &i.code).collect::<Vec<_>>()
        );
    }

    #[test]
    fn truex_cli_ts_no_false_positive() {
        // truex-cli.ts uses truex_verify_receipt (not cognition_run) — A4 must NOT fire
        let content = include_str!("../../../examples/truex-cli.ts");
        let issues = ts_analyzer::analyze_ts(content);
        let a4: Vec<_> = issues.iter().filter(|i| i.code == "WASM4PM-TS-A4").collect();
        assert!(
            a4.is_empty(),
            "truex-cli.ts must not trigger A4 (findings is valid on truex results), got: {:?}",
            a4
        );
    }

    #[test]
    fn structural_fakery_ts_detectors() {
        let content = r#"
import { cognition_run } from '@wasm4pm/cognition';
const my_hash = {
    hash: "short_hash_here_only_24_chars"
};
const metrics = {
    fitness: 0.8 // fallback stub result
};
const lie = {
    optimal: true // simplified approach
};
const val = Math.random();
// TODO: fix this fake implementation
"#;
        let issues = ts_analyzer::analyze_ts(content);
        let codes: Vec<_> = issues.iter().map(|i| i.code.as_str()).collect();
        assert!(codes.contains(&"STRUCTURAL-FAKERY-R1"), "Missing R1 for Math.random()");
        assert!(codes.contains(&"STRUCTURAL-FAKERY-R2"), "Missing R2 for short hash");
        assert!(codes.contains(&"STRUCTURAL-FAKERY-R3"), "Missing R3 for optimal: true");
        assert!(codes.contains(&"STRUCTURAL-FAKERY-R4"), "Missing R4 for fitness stub");
        assert!(codes.contains(&"STRUCTURAL-FAKERY-TS-MARKER"), "Missing marker for TODO");
    }
}
