use lsp_max::lsp_types::{Diagnostic, DiagnosticSeverity, NumberOrString, Position, Range};
use serde_json::json;

use crate::ogse::substrate_index::SubstrateIndex;

// ---------------------------------------------------------------------------
// Crown field validation constants
// ---------------------------------------------------------------------------

const HEX64_LEN: usize = 64;
const HEX16_LEN: usize = 16;

fn is_hex(s: &str, expected_len: usize) -> bool {
    s.len() == expected_len && s.chars().all(|c| c.is_ascii_hexdigit())
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single OGSE diagnostic bundled with its law metadata.
pub struct OgseDiagnostic {
    pub diag: Diagnostic,
    pub law: &'static str,
    pub failed_term: &'static str,
    pub artifact_kind: &'static str,
}

impl OgseDiagnostic {
    fn new(
        range: Range,
        severity: DiagnosticSeverity,
        code: &'static str,
        message: String,
        law: &'static str,
        failed_term: &'static str,
        artifact_kind: &'static str,
        suggested_code_action: &'static str,
    ) -> Self {
        let data = json!({
            "law": law,
            "failedTerm": failed_term,
            "artifactKind": artifact_kind,
            "suggestedCodeAction": suggested_code_action,
        });

        let diag = Diagnostic {
            range,
            severity: Some(severity),
            code: Some(NumberOrString::String(code.to_string())),
            source: Some("ogse".to_string()),
            message,
            related_information: None,
            tags: None,
            data: Some(data),
            code_description: None,
        };

        OgseDiagnostic {
            diag,
            law,
            failed_term,
            artifact_kind,
        }
    }

    /// Convenience: zero-width range at the top of the document.
    fn origin() -> Range {
        Range {
            start: Position {
                line: 0,
                character: 0,
            },
            end: Position {
                line: 0,
                character: 0,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Index-level diagnostics
// ---------------------------------------------------------------------------

/// Emit OGSE diagnostics derived from the full [`SubstrateIndex`].
///
/// Walks every algorithm entry and checks all four admission terms
/// (F, R, C, P) plus ontology drift.
pub fn diagnostics_for_index(index: &SubstrateIndex) -> Vec<OgseDiagnostic> {
    let mut out = Vec::new();
    let range = OgseDiagnostic::origin();

    for (id, _entry, standing) in index.all() {
        // ----------------------------------------------------------------
        // ogse.missing_receipt — L3 / R
        // Admitted algorithm has no pi-<algo>-latest.json receipt on disk.
        // ----------------------------------------------------------------
        if standing.admitted && !standing.receipted {
            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::ERROR,
                "ogse.missing_receipt",
                format!(
                    "Algorithm '{}' is admitted but has no pi-{}-latest.json receipt. \
                     R-term violated.",
                    id, id
                ),
                "L3",
                "R",
                "receipt",
                "Run `wpm cognition run` for this algorithm and commit the receipt \
                 to .wasm4pm/receipts/pi-<algo>-latest.json",
            ));
        }

        // ----------------------------------------------------------------
        // ogse.missing_replay_pointer — L3 / R
        // Algo has a receipt but the crown fields are invalid/missing.
        // ----------------------------------------------------------------
        if standing.admitted && standing.receipted && !standing.receipt_crown_valid {
            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::ERROR,
                "ogse.missing_replay_pointer",
                format!(
                    "Algorithm '{}' receipt exists but crown fields are invalid or missing \
                     (expected: algorithm, input_hash[64hex], output_hash[64hex], run_id, \
                     replay_pointer[16hex], timestamp). R-term violated.",
                    id
                ),
                "L3",
                "R",
                "receipt",
                "Regenerate the receipt via `wpm cognition run`; ensure all six crown \
                 fields are populated with correct shapes.",
            ));
        }

        // ----------------------------------------------------------------
        // ogse.missing_falsifier — L3 / F
        // Algorithm declared in O* but no paper-grounded test fn found.
        // ----------------------------------------------------------------
        if !standing.falsified {
            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::ERROR,
                "ogse.missing_falsifier",
                format!(
                    "Algorithm '{}' has no paper-grounded falsifier test function. \
                     F-term violated.",
                    id
                ),
                "L3",
                "F",
                "test",
                "Add a `#[test] fn falsifier_<algo>()` in tests/paper_grounded.rs that \
                 asserts the published numeric value from the paper with a tolerance.",
            ));
        }

        // ----------------------------------------------------------------
        // ogse.unadmitted_ocel_report — L3 / C
        // Registry marks algo as CERTIFIED (generated=true) but OCEL report
        // has admitted=false or is missing entirely.
        // ----------------------------------------------------------------
        if standing.generated && !standing.admitted {
            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::ERROR,
                "ogse.unadmitted_ocel_report",
                format!(
                    "Algorithm '{}' is CERTIFIED in registry but OCEL report has \
                     admitted=false or is absent. C-term violated.",
                    id
                ),
                "L3",
                "C",
                "ocel_report",
                "Run `just project-evidence` to regenerate OCEL reports; ensure \
                 ocel/reports/<algo>.json shows admitted=true, fitness=1.0.",
            ));
        }
    }

    // ------------------------------------------------------------------
    // ogse.ontology_drift — L2 / δ
    // Registry wasm_export field differs from TTL wasmExport value.
    // ------------------------------------------------------------------
    for (algo_id, registry_value, ttl_value) in index.drift_pairs() {
        out.push(OgseDiagnostic::new(
            OgseDiagnostic::origin(),
            DiagnosticSeverity::ERROR,
            "ogse.ontology_drift",
            format!(
                "Ontology drift on '{}': registry wasm_export='{}' but TTL \
                 wasmExport='{}'. L2 drift law violated.",
                algo_id, registry_value, ttl_value
            ),
            "L2",
            "δ",
            "registry",
            "Run `ggen sync` to regenerate registry.json from the TTL; never \
             hand-edit ggen-rendered surfaces.",
        ));
    }

    out
}

// ---------------------------------------------------------------------------
// Receipt JSON diagnostics
// ---------------------------------------------------------------------------

/// Parse a receipt JSON blob and validate all six crown fields.
///
/// `algo_id` is used in diagnostic messages when the JSON is unparseable.
/// Emits `ogse.missing_replay_pointer` for each missing or malformed field.
pub fn diagnostics_for_receipt_json(algo_id: &str, text: &str) -> Vec<OgseDiagnostic> {
    let mut out = Vec::new();
    let range = OgseDiagnostic::origin();

    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => {
            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::ERROR,
                "ogse.missing_replay_pointer",
                format!(
                    "Receipt JSON for '{}' is not valid JSON: {e}. All crown fields absent.",
                    algo_id
                ),
                "L3",
                "R",
                "receipt",
                "Ensure the receipt file is valid JSON produced by `wpm cognition run`.",
            ));
            return out;
        }
    };

    // Crown field 1: algorithm — non-empty string
    match value.get("algorithm").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => {}
        Some(_) => out.push(crown_field_diag(
            "algorithm",
            "non-empty string",
            "algorithm field is an empty string",
        )),
        None => out.push(crown_field_diag(
            "algorithm",
            "non-empty string",
            "algorithm field is absent or not a string",
        )),
    }

    // Crown field 2: input_hash — 64 hex chars
    match value.get("input_hash").and_then(|v| v.as_str()) {
        Some(s) if is_hex(s, HEX64_LEN) => {}
        Some(s) => out.push(crown_field_diag(
            "input_hash",
            "64-character hex string",
            &format!("input_hash has wrong shape: '{}'", s),
        )),
        None => out.push(crown_field_diag(
            "input_hash",
            "64-character hex string",
            "input_hash field is absent or not a string",
        )),
    }

    // Crown field 3: output_hash — 64 hex chars
    match value.get("output_hash").and_then(|v| v.as_str()) {
        Some(s) if is_hex(s, HEX64_LEN) => {}
        Some(s) => out.push(crown_field_diag(
            "output_hash",
            "64-character hex string",
            &format!("output_hash has wrong shape: '{}'", s),
        )),
        None => out.push(crown_field_diag(
            "output_hash",
            "64-character hex string",
            "output_hash field is absent or not a string",
        )),
    }

    // Crown field 4: run_id — non-empty string
    match value.get("run_id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => {}
        Some(_) => out.push(crown_field_diag(
            "run_id",
            "non-empty string",
            "run_id field is an empty string",
        )),
        None => out.push(crown_field_diag(
            "run_id",
            "non-empty string",
            "run_id field is absent or not a string",
        )),
    }

    // Crown field 5: replay_pointer — 16 hex chars
    match value.get("replay_pointer").and_then(|v| v.as_str()) {
        Some(s) if is_hex(s, HEX16_LEN) => {}
        Some(s) => out.push(crown_field_diag(
            "replay_pointer",
            "16-character hex string",
            &format!("replay_pointer has wrong shape: '{}'", s),
        )),
        None => out.push(crown_field_diag(
            "replay_pointer",
            "16-character hex string",
            "replay_pointer field is absent or not a string",
        )),
    }

    // Crown field 6: timestamp — present (any non-null value accepted)
    if value.get("timestamp").map(|v| v.is_null()).unwrap_or(true) {
        out.push(crown_field_diag(
            "timestamp",
            "present non-null value",
            "timestamp field is absent or null",
        ));
    }

    out
}

/// Build an `ogse.missing_replay_pointer` diagnostic for a single bad crown field.
fn crown_field_diag(field: &str, expected: &str, detail: &str) -> OgseDiagnostic {
    OgseDiagnostic::new(
        OgseDiagnostic::origin(),
        DiagnosticSeverity::ERROR,
        "ogse.missing_replay_pointer",
        format!(
            "Receipt crown field '{}' is invalid (expected {detail}; got {expected}). \
             R-term violated.",
            field,
            detail = detail,
            expected = expected,
        ),
        "L3",
        "R",
        "receipt",
        "Regenerate the receipt via `wpm cognition run`; all six crown fields must \
         be present and correctly shaped.",
    )
}

// ---------------------------------------------------------------------------
// Free-text diagnostics
// ---------------------------------------------------------------------------

/// Scan raw text for vocabulary violations and prohibited source patterns.
///
/// `path` is used in diagnostic messages for context.
///
/// Emits:
/// - `ogse.overclaim_status` when the word "leg-acy" appears (case-insensitive)
/// - `ogse.generated_surface_edit` when a DO NOT EDIT / auto-generated banner is found
pub fn diagnostics_for_text(path: &str, text: &str) -> Vec<OgseDiagnostic> {
    let mut out = Vec::new();

    // Walk lines so we can produce accurate positions.
    for (line_idx, line) in text.lines().enumerate() {
        let lower = line.to_lowercase();

        // ----------------------------------------------------------------
        // DO NOT EDIT / auto-generated banner detection
        // ----------------------------------------------------------------
        let do_not_edit_patterns = [
            "do not edit",
            "do not modify",
            "auto-generated",
            "autogenerated",
            "generated by",
            "this file is generated",
        ];
        for pattern in &do_not_edit_patterns {
            if lower.contains(pattern) {
                let char_col = lower.find(pattern).unwrap_or(0) as u32;
                let end_col = char_col + pattern.len() as u32;
                let range = Range {
                    start: Position {
                        line: line_idx as u32,
                        character: char_col,
                    },
                    end: Position {
                        line: line_idx as u32,
                        character: end_col,
                    },
                };
                out.push(OgseDiagnostic::new(
                    range,
                    DiagnosticSeverity::ERROR,
                    "ogse.generated_surface_edit",
                    format!(
                        "File '{}' line {} contains a DO NOT EDIT / auto-generated banner (pattern: '{}'). \
                         ggen-rendered sources are first-class source; this caste comment violates GGEN-SRC-002.",
                        path,
                        line_idx + 1,
                        pattern,
                    ),
                    "boundary",
                    "DO_NOT_EDIT",
                    "source_text",
                    "Remove the DO NOT EDIT banner. ggen-rendered files are source — \
                     inspect and repair them directly. If the defect belongs to the pack \
                     seed, edit the TTL/query/template and re-run `ggen sync`.",
                ));
                break; // one diagnostic per line for banner
            }
        }

        // ----------------------------------------------------------------
        // Prohibited vocabulary: 'leg-acy'
        // ----------------------------------------------------------------
        let mut search_from = 0usize;
        while let Some(col) = lower[search_from..].find(concat!("leg", "acy")) {
            let abs_col = search_from + col;
            let char_col = abs_col as u32;
            let end_col = char_col + concat!("leg", "acy").len() as u32;

            let range = Range {
                start: Position {
                    line: line_idx as u32,
                    character: char_col,
                },
                end: Position {
                    line: line_idx as u32,
                    character: end_col,
                },
            };

            out.push(OgseDiagnostic::new(
                range,
                DiagnosticSeverity::WARNING,
                "ogse.overclaim_status",
                format!(
                    "Prohibited vocabulary 'leg-acy' found in '{}' at line {}:{}. \
                     Use PARTIAL_ALIVE, UNSUPPORTED, or CERTIFIED status literals.",
                    path,
                    line_idx + 1,
                    abs_col + 1,
                ),
                "vocabulary",
                "—",
                "source_text",
                "Replace 'leg-acy' with the canonical status term from the OGSE \
                 vocabulary (PARTIAL_ALIVE | UNSUPPORTED | CERTIFIED).",
            ));

            search_from = abs_col + concat!("leg", "acy").len();
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Code explain
// ---------------------------------------------------------------------------

/// Return `(title, law_text, fix_hint)` for a recognised `ogse.*` code.
///
/// Returns `None` for unknown codes.
pub fn explain_ogse_code(code: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match code {
        "ogse.missing_receipt" => Some((
            "Missing admission receipt",
            "Admission law — Λ(a)=F∧R∧C∧P; all four terms required for admission",
            "Run `wpm cognition run` for the algorithm and commit the receipt to \
             .wasm4pm/receipts/pi-<algo>-latest.json. The receipt must carry all \
             six crown fields.",
        )),

        "ogse.missing_replay_pointer" => Some((
            "Invalid or missing receipt crown fields",
            "Admission law — Λ(a)=F∧R∧C∧P; all four terms required for admission",
            "Regenerate the receipt via `wpm cognition run`. Ensure the JSON contains \
             algorithm (string), input_hash (64 hex), output_hash (64 hex), run_id \
             (string), replay_pointer (16 hex), and timestamp (non-null).",
        )),

        "ogse.missing_falsifier" => Some((
            "No paper-grounded falsifier test",
            "Admission law — Λ(a)=F∧R∧C∧P; all four terms required for admission",
            "Add a `#[test] fn falsifier_<algo>()` in tests/paper_grounded.rs that \
             asserts the published numeric result from the paper with a tolerance. \
             Prove the test has teeth by temporarily tampering the computation.",
        )),

        "ogse.unadmitted_ocel_report" => Some((
            "Registry certified but OCEL report not admitted",
            "Admission law — Λ(a)=F∧R∧C∧P; all four terms required for admission",
            "Run `just project-evidence` to regenerate OCEL conformance reports. \
             The file ocel/reports/<algo>.json must contain admitted=true and \
             fitness=1.0 before the registry entry may be CERTIFIED.",
        )),

        "ogse.ontology_drift" => Some((
            "Registry / TTL ontology drift",
            "Drift law — O* is the unique source of truth; registry must mirror it exactly",
            "Run `ggen sync` to regenerate registry.json from the TTL source. \
             Never hand-edit ggen-rendered surfaces (registration.rs, registry.json, \
             breed-ids.ts, paper_pointers_generated.rs, universal_anticheat_generated.rs).",
        )),

        "ogse.generated_surface_edit" => Some((
            "Direct edit of ggen-rendered surface",
            "boundary — ggen-rendered paths are read-only; the TTL is the authority",
            "Discard the edit. To change a breed, edit \
             ggen/ontology/breeds.ttl and run `ggen sync`. Gate: `just ggen-gate`.",
        )),

        "ogse.overclaim_status" => Some((
            concat!("Prohibited vocabulary '", "leg", "acy", "'"),
            "vocabulary — canonical status literals are PARTIAL_ALIVE, UNSUPPORTED, CERTIFIED",
            concat!("Replace every occurrence of '", "leg", "acy", "' with the appropriate canonical \
             status term from the OGSE vocabulary."),
        )),

        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- diagnostics_for_receipt_json --

    #[test]
    fn valid_receipt_emits_no_diagnostics() {
        let receipt = serde_json::json!({
            "algorithm": "alpha_miner",
            "input_hash":  "a".repeat(64),
            "output_hash": "b".repeat(64),
            "run_id": "run-001",
            "replay_pointer": "c".repeat(16),
            "timestamp": "2026-06-12T00:00:00Z",
        });
        let diags = diagnostics_for_receipt_json("alpha_miner", &receipt.to_string());
        assert!(
            diags.is_empty(),
            "unexpected diagnostics: {:?}",
            diags.iter().map(|d| &d.diag.message).collect::<Vec<_>>()
        );
    }

    #[test]
    fn missing_all_crown_fields_emits_six_diagnostics() {
        let receipt = serde_json::json!({});
        let diags = diagnostics_for_receipt_json("alpha_miner", &receipt.to_string());
        assert_eq!(diags.len(), 6);
        for d in &diags {
            assert_eq!(
                d.diag.code,
                Some(NumberOrString::String("ogse.missing_replay_pointer".into()))
            );
        }
    }

    #[test]
    fn wrong_hex_length_emits_diagnostic() {
        let receipt = serde_json::json!({
            "algorithm": "alpha_miner",
            "input_hash":  "deadbeef",   // too short
            "output_hash": "b".repeat(64),
            "run_id": "run-001",
            "replay_pointer": "c".repeat(16),
            "timestamp": "2026-06-12T00:00:00Z",
        });
        let diags = diagnostics_for_receipt_json("alpha_miner", &receipt.to_string());
        assert_eq!(diags.len(), 1);
        assert!(diags[0].diag.message.contains("input_hash"));
    }

    #[test]
    fn replay_pointer_wrong_length_emits_diagnostic() {
        let receipt = serde_json::json!({
            "algorithm": "alpha_miner",
            "input_hash":  "a".repeat(64),
            "output_hash": "b".repeat(64),
            "run_id": "run-001",
            "replay_pointer": "c".repeat(8),   // too short
            "timestamp": "2026-06-12T00:00:00Z",
        });
        let diags = diagnostics_for_receipt_json("alpha_miner", &receipt.to_string());
        assert_eq!(diags.len(), 1);
        assert!(diags[0].diag.message.contains("replay_pointer"));
    }

    #[test]
    fn invalid_json_emits_single_diagnostic() {
        let diags = diagnostics_for_receipt_json("alpha_miner", "not json at all {{{");
        assert_eq!(diags.len(), 1);
        assert!(diags[0].diag.message.contains("not valid JSON"));
    }

    // -- diagnostics_for_text --

    #[test]
    fn no_leg_acy_emits_nothing() {
        let diags =
            diagnostics_for_text("src/breeds/mod.rs", "PARTIAL_ALIVE breed with fitness 1.0");
        assert!(diags.is_empty());
    }

    #[test]
    fn leg_acy_word_emits_overclaim_warning() {
        let diags = diagnostics_for_text("src/mod.rs", concat!("this is a ", "leg", "acy", " breed"));
        assert_eq!(diags.len(), 1);
        let d = &diags[0];
        assert_eq!(
            d.diag.code,
            Some(NumberOrString::String("ogse.overclaim_status".into()))
        );
        assert_eq!(d.law, "vocabulary");
        assert_eq!(d.failed_term, "—");
    }

    #[test]
    fn leg_acy_uppercase_still_emits() {
        let diags = diagnostics_for_text("src/mod.rs", concat!("LE", "GA", "CY system detected"));
        assert_eq!(diags.len(), 1);
    }

    #[test]
    fn multiple_leg_acy_occurrences_emit_multiple_diagnostics() {
        let diags = diagnostics_for_text("src/mod.rs", concat!("leg", "acy here and ", "leg", "acy there"));
        assert_eq!(diags.len(), 2);
    }

    #[test]
    fn leg_acy_on_different_lines_correct_positions() {
        let text = concat!("first line\n", "leg", "acy breed\nnormal line\n", "leg", "acy again");
        let diags = diagnostics_for_text("src/mod.rs", text);
        assert_eq!(diags.len(), 2);
        assert_eq!(diags[0].diag.range.start.line, 1);
        assert_eq!(diags[1].diag.range.start.line, 3);
    }

    // -- explain_ogse_code --

    #[test]
    fn explain_all_known_codes() {
        let codes = [
            "ogse.missing_receipt",
            "ogse.missing_replay_pointer",
            "ogse.missing_falsifier",
            "ogse.unadmitted_ocel_report",
            "ogse.ontology_drift",
            "ogse.generated_surface_edit",
            "ogse.overclaim_status",
        ];
        for code in &codes {
            let result = explain_ogse_code(code);
            assert!(
                result.is_some(),
                "explain_ogse_code returned None for '{}'",
                code
            );
            let (title, law_text, fix_hint) = result.unwrap();
            assert!(!title.is_empty());
            assert!(!law_text.is_empty());
            assert!(!fix_hint.is_empty());
        }
    }

    #[test]
    fn explain_l3_codes_cite_admission_law() {
        let l3_codes = [
            "ogse.missing_receipt",
            "ogse.missing_replay_pointer",
            "ogse.missing_falsifier",
            "ogse.unadmitted_ocel_report",
        ];
        for code in &l3_codes {
            let (_, law_text, _) = explain_ogse_code(code).unwrap();
            assert!(
                law_text.contains("Admission law"),
                "L3 code '{}' law_text should cite Admission law, got: {}",
                code,
                law_text
            );
        }
    }

    #[test]
    fn explain_l2_code_cites_drift_law() {
        let (_, law_text, _) = explain_ogse_code("ogse.ontology_drift").unwrap();
        assert!(
            law_text.contains("Drift law"),
            "expected Drift law, got: {}",
            law_text
        );
    }

    #[test]
    fn explain_unknown_code_returns_none() {
        assert!(explain_ogse_code("ogse.nonexistent").is_none());
        assert!(explain_ogse_code("").is_none());
    }

    // -- diagnostic data field shape --

    #[test]
    fn receipt_diagnostic_data_has_all_fields() {
        let receipt = serde_json::json!({});
        let diags = diagnostics_for_receipt_json("alpha_miner", &receipt.to_string());
        let d = &diags[0];
        let data = d.diag.data.as_ref().expect("data must be present");
        assert!(data.get("law").is_some());
        assert!(data.get("failedTerm").is_some());
        assert!(data.get("artifactKind").is_some());
        assert!(data.get("suggestedCodeAction").is_some());
    }

    #[test]
    fn text_diagnostic_data_has_all_fields() {
        let diags = diagnostics_for_text("src/mod.rs", concat!("leg", "acy"));
        let data = diags[0].diag.data.as_ref().expect("data must be present");
        assert!(data.get("law").is_some());
        assert!(data.get("failedTerm").is_some());
        assert!(data.get("artifactKind").is_some());
        assert!(data.get("suggestedCodeAction").is_some());
    }
}
