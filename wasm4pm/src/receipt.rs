use serde::{Deserialize, Serialize};
use sha2::{Digest as Sha2Digest, Sha256};

pub const FORBIDDEN_EVIDENCE_MARKERS: &[&str] = &[
    "placeholder",
    "hash_placeholder",
    "receipt_uuid_placeholder",
    "stub",
    "mock",
    "fake",
    "dummy",
    "simulated",
    "synthetic",
    "test-only",
    "test_only",
    "not-real",
    "not_real",
    "default_role",
    "default_purpose",
    "artifact_needed.md",
    "todo",
    "fixme",
    "changeme",
    "tbd",
    "lorem",
    "example-only",
    "simulation",
    "unknown",
];

/// High-level refusal states for receipt truth verification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptTruthRefusal {
    ExpectedOCELMissing,
    ObservedOCELMissing,
    ObservedOCELSynthetic,
    ExpectedObservedCloneDetected,
    OCELCanonicalHashMismatch,
    BoundaryEvidenceMissing,
    PlaceholderEvidenceDetected,
    StubEvidenceDetected,
    ClosureOverclaimed,
    ArtifactHashMismatch,
    ReceiptHashMismatch,
    ReceiptChainMissing,
    ToolCallHashMissing,
    SyntheticExecutionPath,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FindingSeverity {
    Deny,
    Warning,
}

/// A single adversarial finding found during receipt inspection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptFinding {
    pub code: ReceiptTruthRefusal,
    pub json_path: String,
    pub message: String,
    pub severity: FindingSeverity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptDoctorState {
    Admitted,
    Refused,
}

/// Result of adversarial receipt inspection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptDoctorReport {
    pub state: ReceiptDoctorState,
    pub findings: Vec<ReceiptFinding>,
    pub admitted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiagnosticAudience {
    ProducerSafe,
    OperatorPrivate,
    CiForensics,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerificationState {
    Admitted,
    Refused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RefusalClass {
    None,
    EvidenceIncomplete,
    BoundaryNotObserved,
    PathNotAdmitted,
    ArtifactNotObserved,
    ReceiptNotBound,
    SyntheticEvidenceSuspected,
    PolicyNotSatisfied,
    ReplayNotAdmitted,
    VerifierRefused,
    AdversarialOracleSuppressed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AllowedNextAction {
    None,
    ReobserveBoundaryAndReemitReceipt,
    DoNotPatchReceiptRerunObservation,
    ContactDiagnosticAuthority,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProducerSafeReport {
    pub state: VerificationState,
    pub refusal_class: RefusalClass,
    pub allowed_next_action: AllowedNextAction,
    pub retry_allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperatorPrivateReport {
    pub state: VerificationState,
    pub findings: Vec<ReceiptFinding>,
    pub denied_paths: Vec<String>,
    pub doctor_report_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationReport {
    pub state: VerificationState,
    pub producer_safe: ProducerSafeReport,
    pub operator_private: OperatorPrivateReport,
}

/// Check if a field path is an evidence field.
pub fn is_evidence_field(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with("receipt_hash")
        || lower.ends_with("previous_receipt_hash")
        || lower.ends_with("observed_ocel_hash")
        || lower.ends_with("expected_ocel_hash")
        || lower.ends_with("tool_call_hash")
        || lower.ends_with("event_log_hash")
        || lower.ends_with("result_hash")
        || lower.ends_with("artifact_hash")
        || lower.contains(".boundary_evidence.")
        || lower.contains("boundary_evidence")
        || (lower.contains("events[") && lower.ends_with("].id"))
        || (lower.contains("objects[") && lower.ends_with("].id"))
        || lower.contains("mcp.tool_call_hash")
        || lower.ends_with("role8")
        || lower.ends_with("purpose8")
}

/// Helper to serialize and compute hash.
pub fn compute_blake3_hash(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

pub fn compute_sha256_hash(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// SyntheticMarkerScanner implementation.
pub struct SyntheticMarkerScanner;

impl SyntheticMarkerScanner {
    pub fn scan(value: &serde_json::Value, refusal_state_present: bool) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();
        Self::scan_value("$", value, &mut findings, refusal_state_present);
        findings
    }

    fn scan_value(
        path: &str,
        value: &serde_json::Value,
        findings: &mut Vec<ReceiptFinding>,
        refusal_state_present: bool,
    ) {
        let is_ev = is_evidence_field(path);
        match value {
            serde_json::Value::Null => {
                if is_ev && path != "$.previous_receipt_hash" && !refusal_state_present {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::BoundaryEvidenceMissing,
                        json_path: path.to_string(),
                        message: format!("Evidence field '{}' cannot be null without explanation", path),
                        severity: FindingSeverity::Deny,
                    });
                }
            }
            serde_json::Value::String(s) => {
                let lower = s.to_lowercase();
                if is_ev && s.trim().is_empty() {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::PlaceholderEvidenceDetected,
                        json_path: path.to_string(),
                        message: format!("Evidence field '{}' cannot be empty", path),
                        severity: FindingSeverity::Deny,
                    });
                }
                // Refine check with allowlist replacements to avoid false positives on legitimate algorithm names
                let temp_lower = lower
                    .replace("simulated_annealing", "")
                    .replace("simulated annealing", "");
                for marker in FORBIDDEN_EVIDENCE_MARKERS {
                    if temp_lower.contains(marker) {
                        let severity = if is_ev { FindingSeverity::Deny } else { FindingSeverity::Warning };
                        findings.push(ReceiptFinding {
                            code: ReceiptTruthRefusal::PlaceholderEvidenceDetected,
                            json_path: path.to_string(),
                            message: format!(
                                "Synthetic or placeholder marker detected: '{}' in field '{}'",
                                marker, path
                            ),
                            severity,
                        });
                    }
                }
            }
            serde_json::Value::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    Self::scan_value(&format!("{}[{}]", path, i), item, findings, refusal_state_present);
                }
            }
            serde_json::Value::Object(map) => {
                for (k, v) in map {
                    let next_path = if path == "$" {
                        format!("$.{}", k)
                    } else {
                        format!("{}.{}", path, k)
                    };
                    Self::scan_value(&next_path, v, findings, refusal_state_present);
                }
            }
            _ => {}
        }
    }
}

/// OCELReceiptLinter implementation.
pub struct OCELReceiptLinter;

impl OCELReceiptLinter {
    pub fn lint(receipt: &serde_json::Value) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();

        let algorithms = match receipt.get("algorithms").and_then(|v| v.as_array()) {
            Some(algos) => algos,
            None => {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ObservedOCELMissing,
                    json_path: "$.algorithms".to_string(),
                    message: "Missing 'algorithms' field or it is not an array".to_string(),
                    severity: FindingSeverity::Deny,
                });
                return findings;
            }
        };

        for (algo_idx, algo) in algorithms.iter().enumerate() {
            let algo_path_prefix = format!("$.algorithms[{}]", algo_idx);
            
            // Check expected path
            let expected_path = algo.get("expected_path");
            if expected_path.is_none() || expected_path.unwrap().is_null() {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ExpectedOCELMissing,
                    json_path: format!("{}.expected_path", algo_path_prefix),
                    message: "expected_path is missing or null".to_string(),
                    severity: FindingSeverity::Deny,
                });
            }

            // Check observed path
            let observed_path = algo.get("observed_path");
            if observed_path.is_none() || observed_path.unwrap().is_null() {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ObservedOCELMissing,
                    json_path: format!("{}.observed_path", algo_path_prefix),
                    message: "observed_path is missing or null".to_string(),
                    severity: FindingSeverity::Deny,
                });
                continue;
            }
            let observed_path = observed_path.unwrap();

            let ocel = observed_path.get("ocel");
            if ocel.is_none() || ocel.unwrap().is_null() {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ObservedOCELMissing,
                    json_path: format!("{}.observed_path.ocel", algo_path_prefix),
                    message: "observed_path.ocel is missing".to_string(),
                    severity: FindingSeverity::Deny,
                });
                continue;
            }
            let ocel = ocel.unwrap();

            // Validate events & objects lists
            let events = ocel.get("events").and_then(|v| v.as_array());
            let objects = ocel.get("objects").and_then(|v| v.as_array());

            match events {
                Some(evs) => {
                    if evs.is_empty() {
                        findings.push(ReceiptFinding {
                            code: ReceiptTruthRefusal::ObservedOCELMissing,
                            json_path: format!("{}.observed_path.ocel.events", algo_path_prefix),
                            message: "observed_path.ocel.events is empty".to_string(),
                            severity: FindingSeverity::Deny,
                        });
                    } else {
                        // Check structural validity of events
                        let mut known_object_ids = std::collections::HashSet::new();
                        if let Some(objs) = objects {
                            for obj in objs {
                                if let Some(id) = obj.get("id").and_then(|id| id.as_str()) {
                                    known_object_ids.insert(id.to_string());
                                }
                            }
                        }

                        for (e_idx, ev) in evs.iter().enumerate() {
                            let ev_path = format!("{}.observed_path.ocel.events[{}]", algo_path_prefix, e_idx);
                            if ev.get("id").and_then(|v| v.as_str()).is_none() {
                                findings.push(ReceiptFinding {
                                    code: ReceiptTruthRefusal::ObservedOCELSynthetic,
                                    json_path: format!("{}.id", ev_path),
                                    message: "Event missing 'id'".to_string(),
                                    severity: FindingSeverity::Deny,
                                });
                            }
                            if ev.get("activity").and_then(|v| v.as_str()).is_none() {
                                findings.push(ReceiptFinding {
                                    code: ReceiptTruthRefusal::ObservedOCELSynthetic,
                                    json_path: format!("{}.activity", ev_path),
                                    message: "Event missing 'activity'".to_string(),
                                    severity: FindingSeverity::Deny,
                                });
                            }
                            // check time/timestamp
                            if ev.get("timestamp").is_none() && ev.get("time").is_none() {
                                findings.push(ReceiptFinding {
                                    code: ReceiptTruthRefusal::ObservedOCELSynthetic,
                                    json_path: ev_path.clone(),
                                    message: "Event missing timestamp/time".to_string(),
                                    severity: FindingSeverity::Deny,
                                });
                            }
                            // Validate object refs resolve to objects
                            if let Some(refs) = ev.get("objects").and_then(|v| v.as_array()) {
                                for (r_idx, r) in refs.iter().enumerate() {
                                    if let Some(ref_id) = r.get("id").and_then(|id| id.as_str()) {
                                        if !known_object_ids.contains(ref_id) {
                                            findings.push(ReceiptFinding {
                                                code: ReceiptTruthRefusal::ObservedOCELSynthetic,
                                                json_path: format!("{}.objects[{}]", ev_path, r_idx),
                                                message: format!("Object reference '{}' is dangling", ref_id),
                                                severity: FindingSeverity::Deny,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                None => {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::ObservedOCELMissing,
                        json_path: format!("{}.observed_path.ocel.events", algo_path_prefix),
                        message: "observed_path.ocel.events is missing or not an array".to_string(),
                        severity: FindingSeverity::Deny,
                    });
                }
            }

            match objects {
                Some(objs) => {
                    if objs.is_empty() {
                        findings.push(ReceiptFinding {
                            code: ReceiptTruthRefusal::ObservedOCELMissing,
                            json_path: format!("{}.observed_path.ocel.objects", algo_path_prefix),
                            message: "observed_path.ocel.objects is empty".to_string(),
                            severity: FindingSeverity::Deny,
                        });
                    }
                }
                None => {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::ObservedOCELMissing,
                        json_path: format!("{}.observed_path.ocel.objects", algo_path_prefix),
                        message: "observed_path.ocel.objects is missing or not an array".to_string(),
                        severity: FindingSeverity::Deny,
                    });
                }
            }

            // Verify alignment consistency
            if let Some(alignment) = algo.get("alignment") {
                let status_val = alignment.get("expected_vs_observed").and_then(|v| v.as_str()).unwrap_or("");
                let refusal_state = alignment.get("refusal_state");
                if status_val != "Pass" && (refusal_state.is_none() || refusal_state.unwrap().is_null()) {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::ClosureOverclaimed,
                        json_path: format!("{}.alignment.refusal_state", algo_path_prefix),
                        message: "Non-passing alignment must have an explaining refusal_state".to_string(),
                        severity: FindingSeverity::Deny,
                    });
                }
            }
        }

        findings
    }
}

/// ExpectedObservedCloneDetector implementation.
pub struct ExpectedObservedCloneDetector;

impl ExpectedObservedCloneDetector {
    pub fn check(receipt: &serde_json::Value) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();
        if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
            for (idx, algo) in algorithms.iter().enumerate() {
                let algo_path = format!("$.algorithms[{}]", idx);
                
                let expected_hash = algo.get("expected_path").and_then(|ep| ep.get("expected_ocel_hash")).and_then(|h| h.as_str());
                let observed_hash = algo.get("observed_path").and_then(|op| op.get("observed_ocel_hash")).and_then(|h| h.as_str());

                if let (Some(eh), Some(oh)) = (expected_hash, observed_hash) {
                    if eh == oh {
                        // suspicious cloning
                        findings.push(ReceiptFinding {
                            code: ReceiptTruthRefusal::ExpectedObservedCloneDetected,
                            json_path: format!("{}.observed_path.observed_ocel_hash", algo_path),
                            message: "Observed OCEL hash matches expected hash exactly (unobserved clone suspect)".to_string(),
                            severity: FindingSeverity::Deny,
                        });
                    }
                }

                // Check structural duplication or template constant timestamps
                if let Some(observed_ocel) = algo.get("observed_path").and_then(|op| op.get("ocel")) {
                    if let Some(events) = observed_ocel.get("events").and_then(|evs| evs.as_array()) {
                        if !events.is_empty() {
                            let mut all_timestamps = Vec::new();
                            for ev in events {
                                if let Some(ts) = ev.get("timestamp").and_then(|v| v.as_str()) {
                                    all_timestamps.push(ts.to_string());
                                } else if let Some(ts) = ev.get("time").and_then(|v| v.as_str()) {
                                    all_timestamps.push(ts.to_string());
                                }
                            }
                            // If all timestamps are identical (meaning mock static timestamps without real elapsed time delta)
                            if !all_timestamps.is_empty() && all_timestamps.iter().all(|t| t == &all_timestamps[0]) {
                                // But wait: if there's only 1 event, that's fine. If there are multiple, it is suspicious
                                if all_timestamps.len() > 1 && all_timestamps[0] == "2026-05-21T19:42:52.249Z" {
                                    findings.push(ReceiptFinding {
                                        code: ReceiptTruthRefusal::ExpectedObservedCloneDetected,
                                        json_path: format!("{}.observed_path.ocel.events", algo_path),
                                        message: "Observed events contain static template timestamp constants".to_string(),
                                        severity: FindingSeverity::Deny,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        findings
    }
}

/// BoundaryEvidenceVerifier implementation.
pub struct BoundaryEvidenceVerifier;

impl BoundaryEvidenceVerifier {
    pub fn verify(receipt: &serde_json::Value) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();

        if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
            for (idx, algo) in algorithms.iter().enumerate() {
                let algo_path = format!("$.algorithms[{}]", idx);
                let mut has_boundary = false;

                // Check explicit boundary_evidence field (either at algo level or under observed_path)
                if let Some(be) = algo.get("boundary_evidence")
                    .or_else(|| algo.get("observed_path").and_then(|op| op.get("boundary_evidence")))
                {
                    if !be.is_null() {
                        if let Some(obj) = be.as_object() {
                            if !obj.is_empty() {
                                has_boundary = true;
                            }
                        }
                    }
                }

                // Check nested observed path ocel events for mandatory execution markers
                if let Some(observed_ocel) = algo.get("observed_path").and_then(|op| op.get("ocel")) {
                    if let Some(events) = observed_ocel.get("events").and_then(|evs| evs.as_array()) {
                        // Check if it has real import or completed/hashed events
                        let mut has_import_comp = false;
                        let mut has_algo_comp = false;
                        for ev in events {
                            if let Some(activity) = ev.get("activity").and_then(|a| a.as_str()) {
                                if activity == "wpm.input.import.completed" {
                                    has_import_comp = true;
                                }
                                if activity == "wpm.algorithm.completed" {
                                    has_algo_comp = true;
                                }
                            }
                        }
                        if has_import_comp && has_algo_comp {
                            has_boundary = true;
                        }
                    }
                }

                if !has_boundary {
                    findings.push(ReceiptFinding {
                        code: ReceiptTruthRefusal::BoundaryEvidenceMissing,
                        json_path: format!("{}.observed_path", algo_path),
                        message: "Observed path lacks boundary evidence events or fields".to_string(),
                        severity: FindingSeverity::Deny,
                    });
                }
            }
        }
        findings
    }
}

/// ClosureOverclaimDetector implementation.
pub struct ClosureOverclaimDetector;

impl ClosureOverclaimDetector {
    pub fn detect(receipt: &serde_json::Value) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();

        let all_real = receipt.get("all_real").and_then(|v| v.as_bool()).unwrap_or(false);
        let receipt_hash = receipt.get("receipt_hash").and_then(|v| v.as_str());

        if all_real {
            if receipt_hash.is_none() || receipt_hash.unwrap().is_empty() || receipt_hash.unwrap().contains("placeholder") {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ClosureOverclaimed,
                    json_path: "$.receipt_hash".to_string(),
                    message: "Closed/verified receipt requires a non-empty, non-placeholder receipt_hash".to_string(),
                    severity: FindingSeverity::Deny,
                });
            }

            if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
                for (idx, algo) in algorithms.iter().enumerate() {
                    let algo_path = format!("$.algorithms[{}]", idx);
                    
                    // Check alignment
                    let mut has_pass = false;
                    if let Some(alignment) = algo.get("alignment") {
                        let status_val = alignment.get("expected_vs_observed").and_then(|v| v.as_str()).unwrap_or("");
                        if status_val == "Pass" {
                            has_pass = true;
                        } else {
                            findings.push(ReceiptFinding {
                                code: ReceiptTruthRefusal::ClosureOverclaimed,
                                json_path: format!("{}.alignment.expected_vs_observed", algo_path),
                                message: format!("Cannot claim all_real=true with non-passing alignment status: {}", status_val),
                                severity: FindingSeverity::Deny,
                            });
                        }
                    } else {
                        findings.push(ReceiptFinding {
                            code: ReceiptTruthRefusal::ClosureOverclaimed,
                            json_path: format!("{}.alignment", algo_path),
                            message: "Closed receipt requires alignment information".to_string(),
                            severity: FindingSeverity::Deny,
                        });
                    }

                    // Check observed OCEL events for artifact.emitted and task.closed
                    let mut has_artifact_emitted = false;
                    let mut has_task_closed = false;
                    
                    if let Some(observed_ocel) = algo.get("observed_path").and_then(|op| op.get("ocel")) {
                        if let Some(events) = observed_ocel.get("events").and_then(|evs| evs.as_array()) {
                            for ev in events {
                                if let Some(activity) = ev.get("activity").and_then(|a| a.as_str()) {
                                    if activity.contains("artifact.emitted") {
                                        has_artifact_emitted = true;
                                    }
                                    if activity.contains("task.closed") || activity.contains("task.completed") {
                                        has_task_closed = true;
                                    }
                                }
                            }
                        }
                    }

                    if has_pass {
                        if !has_artifact_emitted {
                            findings.push(ReceiptFinding {
                                code: ReceiptTruthRefusal::ClosureOverclaimed,
                                json_path: format!("{}.observed_path.ocel.events", algo_path),
                                message: "Closed receipt requires an artifact.emitted event in observed path".to_string(),
                                severity: FindingSeverity::Deny,
                            });
                        }
                        if !has_task_closed {
                            findings.push(ReceiptFinding {
                                code: ReceiptTruthRefusal::ClosureOverclaimed,
                                json_path: format!("{}.observed_path.ocel.events", algo_path),
                                message: "Closed receipt requires a task.closed event in observed path".to_string(),
                                severity: FindingSeverity::Deny,
                            });
                        }
                    }
                }
            }
        }

        findings
    }
}

/// CanonicalHashVerifier implementation.
pub struct CanonicalHashVerifier;

impl CanonicalHashVerifier {
    pub fn verify(receipt: &serde_json::Value) -> Vec<ReceiptFinding> {
        let mut findings = Vec::new();

        // 1. Verify individual algorithms' observed_ocel_hash matches canonical ocel serialization
        if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
            for (idx, algo) in algorithms.iter().enumerate() {
                let algo_path = format!("$.algorithms[{}]", idx);
                if let Some(observed_path) = algo.get("observed_path") {
                    if let Some(ocel) = observed_path.get("ocel") {
                        if let Some(stored_hash) = observed_path.get("observed_ocel_hash").and_then(|h| h.as_str()) {
                            // Check that stored hash is not placeholder
                            if stored_hash.is_empty() || stored_hash.contains("placeholder") {
                                findings.push(ReceiptFinding {
                                    code: ReceiptTruthRefusal::PlaceholderEvidenceDetected,
                                    json_path: format!("{}.observed_path.observed_ocel_hash", algo_path),
                                    message: "Placeholder observed_ocel_hash detected".to_string(),
                                    severity: FindingSeverity::Deny,
                                });
                                continue;
                            }

                            // Recompute using serde_json to_string (minified)
                            let serialized = serde_json::to_string(ocel).unwrap_or_default();
                            let blake3_computed = compute_blake3_hash(&serialized);
                            let sha256_computed = compute_sha256_hash(&serialized);

                            if stored_hash != blake3_computed && stored_hash != sha256_computed {
                                findings.push(ReceiptFinding {
                                    code: ReceiptTruthRefusal::OCELCanonicalHashMismatch,
                                    json_path: format!("{}.observed_path.observed_ocel_hash", algo_path),
                                    message: format!(
                                        "OCEL canonical hash mismatch. Stored: '{}', Computed BLAKE3: '{}', SHA256: '{}'",
                                        stored_hash, blake3_computed, sha256_computed
                                    ),
                                    severity: FindingSeverity::Deny,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 2. Verify root receipt_hash matches canonical receipt (excluding receipt_hash)
        if let Some(stored_receipt_hash) = receipt.get("receipt_hash").and_then(|h| h.as_str()) {
            if stored_receipt_hash.is_empty() || stored_receipt_hash.contains("placeholder") {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::PlaceholderEvidenceDetected,
                    json_path: "$.receipt_hash".to_string(),
                    message: "Placeholder receipt_hash detected".to_string(),
                    severity: FindingSeverity::Deny,
                });
                return findings;
            }

            // Remove receipt_hash key from clone
            let mut clone = receipt.clone();
            if let Some(map) = clone.as_object_mut() {
                map.remove("receipt_hash");
            }

            let serialized = serde_json::to_string(&clone).unwrap_or_default();
            let blake3_computed = compute_blake3_hash(&serialized);
            let sha256_computed = compute_sha256_hash(&serialized);

            if stored_receipt_hash != blake3_computed && stored_receipt_hash != sha256_computed {
                findings.push(ReceiptFinding {
                    code: ReceiptTruthRefusal::ReceiptHashMismatch,
                    json_path: "$.receipt_hash".to_string(),
                    message: format!(
                        "Receipt root hash mismatch. Stored: '{}', Computed BLAKE3: '{}', SHA256: '{}'",
                        stored_receipt_hash, blake3_computed, sha256_computed
                    ),
                    severity: FindingSeverity::Deny,
                });
            }
        }

        findings
    }
}

/// Core ReceiptDoctor class implementation.
pub struct ReceiptDoctor;

impl ReceiptDoctor {
    /// Perform adversarial diagnostics and audits on the receipt.
    pub fn audit(receipt: &serde_json::Value) -> ReceiptDoctorReport {
        let mut findings = Vec::new();

        // 1. Synthetic marker scan
        // First determine if alignment contains a refusal_state
        let mut refusal_state_present = false;
        if let Some(algorithms) = receipt.get("algorithms").and_then(|v| v.as_array()) {
            for algo in algorithms {
                if let Some(alignment) = algo.get("alignment") {
                    if let Some(ref_st) = alignment.get("refusal_state") {
                        if !ref_st.is_null() && ref_st.as_str().is_some() {
                            refusal_state_present = true;
                            break;
                        }
                    }
                }
            }
        }
        findings.extend(SyntheticMarkerScanner::scan(receipt, refusal_state_present));

        // 2. OCEL structural linter
        findings.extend(OCELReceiptLinter::lint(receipt));

        // 3. Expected/observed clone detection
        findings.extend(ExpectedObservedCloneDetector::check(receipt));

        // 4. Boundary evidence verifier
        findings.extend(BoundaryEvidenceVerifier::verify(receipt));

        // 5. Closure overclaim check
        findings.extend(ClosureOverclaimDetector::detect(receipt));

        // 6. Hash validation check
        findings.extend(CanonicalHashVerifier::verify(receipt));

        // State is Refused if there are any Deny findings
        let has_deny = findings.iter().any(|f| matches!(f.severity, FindingSeverity::Deny));
        let state = if has_deny { ReceiptDoctorState::Refused } else { ReceiptDoctorState::Admitted };
        let admitted = !has_deny;

        ReceiptDoctorReport { state, findings, admitted }
    }

    /// Exposes verification report with partitioned diagnostics based on audience.
    pub fn verify_with_audience(
        receipt: &serde_json::Value,
        audience: DiagnosticAudience,
    ) -> VerificationReport {
        let doctor_report = Self::audit(receipt);
        let state = match doctor_report.state {
            ReceiptDoctorState::Admitted => VerificationState::Admitted,
            ReceiptDoctorState::Refused => VerificationState::Refused,
        };

        // Determine coarse refusal class for LLM / ProducerSafe
        let mut refusal_class = RefusalClass::None;
        let mut allowed_next_action = AllowedNextAction::None;
        let mut retry_allowed = true;

        if state == VerificationState::Refused {
            allowed_next_action = AllowedNextAction::ReobserveBoundaryAndReemitReceipt;
            
            // Map the most critical/deny finding to the coarse refusal class
            for finding in &doctor_report.findings {
                if matches!(finding.severity, FindingSeverity::Deny) {
                    match finding.code {
                        ReceiptTruthRefusal::PlaceholderEvidenceDetected
                        | ReceiptTruthRefusal::StubEvidenceDetected
                        | ReceiptTruthRefusal::ObservedOCELSynthetic
                        | ReceiptTruthRefusal::SyntheticExecutionPath => {
                            refusal_class = RefusalClass::SyntheticEvidenceSuspected;
                            allowed_next_action = AllowedNextAction::DoNotPatchReceiptRerunObservation;
                            retry_allowed = false;
                        }
                        ReceiptTruthRefusal::ExpectedObservedCloneDetected => {
                            refusal_class = RefusalClass::SyntheticEvidenceSuspected;
                            allowed_next_action = AllowedNextAction::DoNotPatchReceiptRerunObservation;
                            retry_allowed = false;
                        }
                        ReceiptTruthRefusal::BoundaryEvidenceMissing => {
                            refusal_class = RefusalClass::BoundaryNotObserved;
                        }
                        ReceiptTruthRefusal::ExpectedOCELMissing
                        | ReceiptTruthRefusal::ObservedOCELMissing
                        | ReceiptTruthRefusal::ToolCallHashMissing => {
                            refusal_class = RefusalClass::EvidenceIncomplete;
                        }
                        ReceiptTruthRefusal::OCELCanonicalHashMismatch
                        | ReceiptTruthRefusal::ReceiptHashMismatch
                        | ReceiptTruthRefusal::ReceiptChainMissing => {
                            refusal_class = RefusalClass::ReceiptNotBound;
                        }
                        ReceiptTruthRefusal::ClosureOverclaimed => {
                            refusal_class = RefusalClass::VerifierRefused;
                        }
                        _ => {
                            refusal_class = RefusalClass::VerifierRefused;
                        }
                    }
                    break;
                }
            }
        }

        // If audience asks for producer diagnostics but they are too specific
        if matches!(audience, DiagnosticAudience::ProducerSafe) && state == VerificationState::Refused {
            // Adversarial oracle suppression mode
            refusal_class = RefusalClass::SyntheticEvidenceSuspected;
            allowed_next_action = AllowedNextAction::DoNotPatchReceiptRerunObservation;
            retry_allowed = false;
        }

        let producer_safe = ProducerSafeReport {
            state,
            refusal_class,
            allowed_next_action,
            retry_allowed,
        };

        // Operator private / CI forensics report
        let denied_paths = doctor_report
            .findings
            .iter()
            .filter(|f| matches!(f.severity, FindingSeverity::Deny))
            .map(|f| f.json_path.clone())
            .collect::<Vec<_>>();

        // Compute a doctor report hash for integrity
        let serialized_findings = serde_json::to_string(&doctor_report.findings).unwrap_or_default();
        let doctor_report_hash = compute_blake3_hash(&serialized_findings);

        let operator_private = OperatorPrivateReport {
            state,
            findings: doctor_report.findings,
            denied_paths,
            doctor_report_hash,
        };

        VerificationReport {
            state,
            producer_safe,
            operator_private,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_refuses_placeholder_hashes() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
                "event_log_format": "xes",
                "activity_key": "concept:name"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "hash_placeholder",
                    "duration_ms": 29.45,
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11",
                        "required_events": ["wpm.input.import.started"]
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "1cb17f11",
                        "observed_result_hash": "hash_placeholder"
                    }
                }
            ],
            "receipt_hash": "placeholder_receipt_hash"
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
        let has_placeholder_error = report.findings.iter().any(|f| {
            f.code == ReceiptTruthRefusal::PlaceholderEvidenceDetected && matches!(f.severity, FindingSeverity::Deny)
        });
        assert!(has_placeholder_error);
    }

    #[test]
    fn test_refuses_default_role_and_purpose() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
                "event_log_format": "xes",
                "activity_key": "concept:name"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "duration_ms": 29.45,
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11",
                        "required_events": ["wpm.input.import.started"]
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "1cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "role8": "default_role",
                        "purpose8": "default_purpose"
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_expected_observed_clone() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb",
                "event_log_format": "xes",
                "activity_key": "concept:name"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "duration_ms": 29.45,
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f1183c046e0447aaafcccc75c67741fbd346662fbe330ff9b5332d820e8",
                        "required_events": ["wpm.input.import.started"]
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "1cb17f1183c046e0447aaafcccc75c67741fbd346662fbe330ff9b5332d820e8",
                        "observed_result_hash": "343a0b9e"
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
        let has_clone_error = report.findings.iter().any(|f| {
            f.code == ReceiptTruthRefusal::ExpectedObservedCloneDetected && matches!(f.severity, FindingSeverity::Deny)
        });
        assert!(has_clone_error);
    }

    #[test]
    fn test_refuses_stub_tool_call_hash() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "events": [],
                            "objects": []
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "mcp": {
                            "tool_call_hash": "stub_hash"
                        }
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_receipt_uuid_placeholder_in_ocel() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "receipt_uuid_placeholder",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e"
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_stdout_only_evidence() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "events": [],
                            "objects": []
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "stdout": "task completed",
                        "exit_code": 0
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_exit_code_only_evidence() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "events": [],
                            "objects": []
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "exit_code": 0
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_closed_without_artifact_emitted() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "all_real": true,
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.task.closed",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "boundary_evidence": {
                            "stdout_hash": "3adbffc69f"
                        }
                    },
                    "alignment": {
                        "expected_vs_observed": "Pass"
                    }
                }
            ],
            "receipt_hash": "f626244df88e50b86a86c67efbe567a8451897c8cf423ab63b65287fbd52d0fa"
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_closed_without_task_closed() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "all_real": true,
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.artifact.emitted",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "boundary_evidence": {
                            "stdout_hash": "3adbffc69f"
                        }
                    },
                    "alignment": {
                        "expected_vs_observed": "Pass"
                    }
                }
            ],
            "receipt_hash": "f626244df88e50b86a86c67efbe567a8451897c8cf423ab63b65287fbd52d0fa"
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_observed_ocel_without_boundary_evidence() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e"
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_refuses_synthetic_execution_marker() {
        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": {
                            "schema": "schema1",
                            "events": [
                                {
                                    "id": "evt1",
                                    "activity": "wpm.input.import.started",
                                    "timestamp": "2026-05-21T19:42:52.248Z",
                                    "objects": []
                                }
                            ],
                            "objects": [
                                { "id": "log1", "type": "Log" }
                            ]
                        },
                        "observed_ocel_hash": "2cb17f11",
                        "observed_result_hash": "343a0b9e",
                        "boundary_evidence": {
                            "stdout_hash": "fake_stdout_marker"
                        }
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        assert_eq!(report.state, ReceiptDoctorState::Refused);
    }

    #[test]
    fn test_admits_created_only_with_real_boundary_evidence_and_artifact_missing() {
        let ocel = json!({
            "schema": "schema1",
            "events": [
                {
                    "id": "evt1",
                    "activity": "wpm.input.import.completed",
                    "timestamp": "2026-05-21T19:42:52.248Z",
                    "objects": []
                },
                {
                    "id": "evt2",
                    "activity": "wpm.algorithm.completed",
                    "timestamp": "2026-05-21T19:42:53.248Z",
                    "objects": []
                }
            ],
            "objects": [
                { "id": "log1", "type": "Log" }
            ]
        });

        let ocel_serialized = serde_json::to_string(&ocel).unwrap();
        let ocel_hash = compute_blake3_hash(&ocel_serialized);

        let receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        "expected_ocel_hash": "1cb17f11"
                    },
                    "observed_path": {
                        "ocel": ocel,
                        "observed_ocel_hash": ocel_hash,
                        "observed_result_hash": "343a0b9e"
                    }
                }
            ]
        });

        let report = ReceiptDoctor::audit(&receipt);
        if report.state != ReceiptDoctorState::Admitted {
            println!("FINDINGS: {:#?}", report.findings);
        }
        assert_eq!(report.state, ReceiptDoctorState::Admitted);
    }

    #[test]
    fn test_admits_closed_with_real_ocel_artifact_alignment_and_hashes() {
        let mut ocel = json!({
            "schema": "schema1",
            "events": [
                {
                    "id": "evt1",
                    "activity": "wpm.task.closed",
                    "timestamp": "2026-05-21T19:42:52.248Z",
                    "objects": []
                },
                {
                    "id": "evt2",
                    "activity": "wpm.artifact.emitted",
                    "timestamp": "2026-05-21T19:42:53.248Z",
                    "objects": []
                }
            ],
            "objects": [
                { "id": "log1", "type": "Log" }
            ]
        });

        // Compute the ocel hash
        let ocel_serialized = serde_json::to_string(&ocel).unwrap();
        let ocel_hash = compute_blake3_hash(&ocel_serialized);

        let mut receipt = json!({
            "receipt_type": "Wasm4pmExecutionReceipt",
            "receipt_schema": "Wasm4pmExecutionReceipt.v1",
            "package": "wasm4pm",
            "version": "26.5.21",
            "commit": "2f65dc9dd706203462ef92bc4815f24bec61159f",
            "hash_algorithm": "BLAKE3",
            "all_real": true,
            "input": {
                "event_log_hash": "3adbffc69f88c3c0c454262de8ee79e791993139acff50ffe7d2ad09950c19bb"
            },
            "algorithms": [
                {
                    "id": "dfg",
                    "registry_present": true,
                    "dispatched": true,
                    "result_hash": "343a0b9e",
                    "expected_path": {
                        "route_id": "route1",
                        // Make expected hash different to avoid clone detection
                        "expected_ocel_hash": "different_expected_ocel_hash"
                    },
                    "observed_path": {
                        "ocel": ocel,
                        "observed_ocel_hash": ocel_hash,
                        "observed_result_hash": "343a0b9e",
                        "boundary_evidence": {
                            "stdout_hash": "3adbffc69f"
                        }
                    },
                    "alignment": {
                        "expected_vs_observed": "Pass"
                    }
                }
            ]
        });

        // Compute receipt hash
        let receipt_serialized = serde_json::to_string(&receipt).unwrap();
        let receipt_hash = compute_blake3_hash(&receipt_serialized);

        // Put receipt hash back
        receipt.as_object_mut().unwrap().insert("receipt_hash".to_string(), json!(receipt_hash));

        let report = ReceiptDoctor::audit(&receipt);
        if report.state != ReceiptDoctorState::Admitted {
            println!("FINDINGS: {:#?}", report.findings);
        }
        assert_eq!(report.state, ReceiptDoctorState::Admitted);
    }
}
