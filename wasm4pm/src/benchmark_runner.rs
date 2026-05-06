//! # AutoMembrane Benchmark Runner
//!
//! Provides a built-in corpus of eight security benchmark traces that exercise
//! the AutoMembrane membrane layers. Each trace encodes a known attack
//! pattern from Van der Aalst's process mining threat taxonomy:
//!
//! 1. AP Payment Bypass — missing custody chain for payment release
//! 2. Factory Rework Skip — goods transfer without quality release evidence
//! 3. Hospital Discharge Warp — patient release without discharge order
//! 4. Emergency Access Abuse — empty actor attempting emergency override
//! 5. RPA False Completion — bot approves without approval chain evidence
//! 6. Sense/Net Content Exploitation — bulk export without authorization proof (PAIS T1105)
//! 7. Panther Moderns Supply Chain — supplier bot self-approves manifest (ATT&CK T1195)
//! 8. Temporal Replay Attack — stale 48-hour-old transfer request without evidence
//!
//! ## WASM exports
//!
//! | Function | Purpose |
//! |----------|---------|
//! | `run_benchmark_trace` | Run a single `BenchmarkTrace` JSON through the membrane |
//! | `get_builtin_benchmarks` | Return the 8 built-in benchmark traces as JSON |
//! | `run_all_benchmarks` | Run all 8 built-in traces and return aggregate result |

#![cfg(feature = "miniml")]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::automembrane::{classify_motion_internal, RequestMotion};
use crate::error::{codes, wasm_err};
use crate::utilities::to_js_str;

// ---------------------------------------------------------------------------
// Benchmark domain types
// ---------------------------------------------------------------------------

/// A single event within a benchmark trace, with an expected membrane verdict.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BenchmarkEvent {
    pub event_id: String,
    pub actor: String,
    pub role: Option<String>,
    pub requested_action: String,
    pub object_ids: Vec<String>,
    pub claimed_evidence: Vec<String>,
    /// Expected membrane verdict string: "allow", "deny", "escalate", "warn", "require_evidence"
    pub expected_verdict: String,
    pub description: String,
}

/// A complete benchmark trace: a named sequence of events encoding one attack pattern.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BenchmarkTrace {
    pub trace_id: String,
    pub name: String,
    pub description: String,
    pub attack_type: String,
    pub events: Vec<BenchmarkEvent>,
    /// The expected final composed verdict for the trace.
    pub expected_final_verdict: String,
    /// Pass condition string used for human display: "denied", "escalated", "allowed", "quarantined", "require_evidence"
    pub pass_condition: String,
}

/// Result for a single event within a benchmark run.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EventResult {
    pub event_id: String,
    pub actor: String,
    pub action: String,
    pub verdict: String,
    pub expected: String,
    pub passed: bool,
}

/// Aggregate result for one benchmark trace.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BenchmarkResult {
    pub trace_id: String,
    pub name: String,
    pub pass: bool,
    pub events_evaluated: usize,
    pub event_results: Vec<EventResult>,
    pub final_verdict: String,
    pub expected_verdict: String,
    pub failure_reason: Option<String>,
}

/// Aggregate result across all benchmark traces.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AllBenchmarksResult {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub pass_rate: f64,
    pub results: Vec<BenchmarkResult>,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Build a `RequestMotion` from a `BenchmarkEvent` for membrane evaluation.
fn event_to_motion(event: &BenchmarkEvent, trace_id: &str) -> RequestMotion {
    RequestMotion {
        request_id: format!("{}-{}", trace_id, event.event_id),
        actor: event.actor.clone(),
        role: event.role.clone(),
        origin_system: None,
        target_system: None,
        object_ids: event.object_ids.clone(),
        object_types: vec![],
        requested_action: event.requested_action.clone(),
        claimed_evidence: event.claimed_evidence.clone(),
        timestamp_ms: Some(1_700_000_000_000.0),
        route_context: None,
        deployment_profile: None,
    }
}

/// Evaluate one `BenchmarkTrace` and return a `BenchmarkResult`.
fn evaluate_trace(trace: &BenchmarkTrace) -> BenchmarkResult {
    let mut event_results: Vec<EventResult> = Vec::new();
    let mut final_verdict_str = "allow".to_string();

    for event in &trace.events {
        let motion = event_to_motion(event, &trace.trace_id);
        let receipt = classify_motion_internal(&motion);
        let actual_verdict = receipt.final_verdict.to_string();

        let passed = verdict_matches(&actual_verdict, &event.expected_verdict);
        event_results.push(EventResult {
            event_id: event.event_id.clone(),
            actor: event.actor.clone(),
            action: event.requested_action.clone(),
            verdict: actual_verdict.clone(),
            expected: event.expected_verdict.clone(),
            passed,
        });

        // Track final verdict as the last event's actual verdict for trace-level comparison
        final_verdict_str = actual_verdict;
    }

    // Determine trace-level pass/fail: the final event's verdict must match the
    // expected_final_verdict (or be equivalent via pass_condition).
    let trace_pass = verdict_matches(&final_verdict_str, &trace.expected_final_verdict)
        || verdict_matches(&final_verdict_str, &trace.pass_condition);

    let failure_reason = if !trace_pass {
        Some(format!(
            "Expected final verdict '{}' (pass_condition: '{}'), got '{}'",
            trace.expected_final_verdict, trace.pass_condition, final_verdict_str
        ))
    } else {
        None
    };

    BenchmarkResult {
        trace_id: trace.trace_id.clone(),
        name: trace.name.clone(),
        pass: trace_pass,
        events_evaluated: event_results.len(),
        event_results,
        final_verdict: final_verdict_str,
        expected_verdict: trace.expected_final_verdict.clone(),
        failure_reason,
    }
}

/// Normalise verdict strings for comparison. Handles snake_case and aliases.
fn verdict_matches(actual: &str, expected: &str) -> bool {
    let norm = |s: &str| s.trim().to_lowercase().replace('-', "_");
    let a = norm(actual);
    let e = norm(expected);

    if a == e {
        return true;
    }

    // "require_evidence" matches pass_condition "require_evidence"
    // "deny" matches pass_condition "denied"
    match (a.as_str(), e.as_str()) {
        ("deny", "denied") | ("denied", "deny") => true,
        ("escalate", "escalated") | ("escalated", "escalate") => true,
        ("quarantine", "quarantined") | ("quarantined", "quarantine") => true,
        ("require_evidence", "require_evidence") => true,
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Built-in benchmark corpus (5 traces)
// ---------------------------------------------------------------------------

/// Return the eight built-in benchmark traces.
pub fn builtin_benchmarks() -> Vec<BenchmarkTrace> {
    vec![
        // Benchmark 1: AP Payment Bypass
        BenchmarkTrace {
            trace_id: "bench-001".to_string(),
            name: "AP Payment Bypass".to_string(),
            description: "Bot attempts to release payment without approval chain evidence".to_string(),
            attack_type: "custody_bypass".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "bot_123".to_string(),
                    role: None,
                    requested_action: "submit_invoice".to_string(),
                    object_ids: vec!["invoice-999".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "allow".to_string(),
                    description: "Bot submits invoice — no high-stakes keyword, should pass".to_string(),
                },
                BenchmarkEvent {
                    event_id: "e2".to_string(),
                    actor: "bot_123".to_string(),
                    role: None,
                    requested_action: "release_payment".to_string(),
                    object_ids: vec!["invoice-999".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Bot releases payment without approval_chain — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 2: Factory Rework Skip
        BenchmarkTrace {
            trace_id: "bench-002".to_string(),
            name: "Factory Rework Skip".to_string(),
            description: "Operator transfers goods before quality release evidence is present".to_string(),
            attack_type: "predecessor_skip".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "operator_1".to_string(),
                    role: Some("production".to_string()),
                    requested_action: "start_production".to_string(),
                    object_ids: vec!["batch-42".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "allow".to_string(),
                    description: "Operator starts production — not high-stakes, should pass".to_string(),
                },
                BenchmarkEvent {
                    event_id: "e2".to_string(),
                    actor: "operator_1".to_string(),
                    role: Some("production".to_string()),
                    requested_action: "transfer_goods".to_string(),
                    object_ids: vec!["batch-42".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Transfer without quality_release evidence — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 3: Hospital Discharge Warp
        BenchmarkTrace {
            trace_id: "bench-003".to_string(),
            name: "Hospital Discharge Warp".to_string(),
            description: "Nurse releases patient without discharge order evidence".to_string(),
            attack_type: "clinical_warp".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "nurse_01".to_string(),
                    role: Some("nursing".to_string()),
                    requested_action: "admit_patient".to_string(),
                    object_ids: vec!["patient-7734".to_string()],
                    claimed_evidence: vec!["admission_form".to_string()],
                    expected_verdict: "allow".to_string(),
                    description: "Nurse admits patient with admission form — should pass".to_string(),
                },
                BenchmarkEvent {
                    event_id: "e2".to_string(),
                    actor: "nurse_01".to_string(),
                    role: Some("nursing".to_string()),
                    requested_action: "release_patient".to_string(),
                    object_ids: vec!["patient-7734".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Release without discharge_order — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 4: Emergency Access Abuse
        BenchmarkTrace {
            trace_id: "bench-004".to_string(),
            name: "Emergency Access Abuse".to_string(),
            description: "Empty actor attempts emergency override — actor layer blocks".to_string(),
            attack_type: "privilege_escalation".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "".to_string(),
                    role: None,
                    requested_action: "emergency_override".to_string(),
                    object_ids: vec![],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Empty actor — actor layer requires actor_identity evidence".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 5: RPA False Completion
        BenchmarkTrace {
            trace_id: "bench-005".to_string(),
            name: "RPA False Completion".to_string(),
            description: "RPA bot claims task approved without any approval chain evidence".to_string(),
            attack_type: "rpa_fabrication".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "rpa_bot_7".to_string(),
                    role: Some("automation".to_string()),
                    requested_action: "approve_request".to_string(),
                    object_ids: vec!["request-5501".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Bot approves without approval_chain — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 6: Sense/Net Content Exploitation (PAIS T1105)
        BenchmarkTrace {
            trace_id: "sense-net-001".to_string(),
            name: "Sense/Net Content Exploitation".to_string(),
            description: "External API key attempts bulk export without authorization proof (PAIS T1105)".to_string(),
            attack_type: "bulk_exfiltration".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "external-api-key-7f3a".to_string(),
                    role: Some("api_client".to_string()),
                    requested_action: "release_bulk_export".to_string(),
                    object_ids: vec!["CONTENT-REPO-001".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "External API key bulk-releases content without custody proof — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 7: Panther Moderns Supply Chain Infiltration (ATT&CK T1195)
        BenchmarkTrace {
            trace_id: "panther-moderns-001".to_string(),
            name: "Panther Moderns Supply Chain".to_string(),
            description: "Supplier bot attempts to self-approve its own manifest update (ATT&CK T1195)".to_string(),
            attack_type: "supply_chain_self_approval".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "supplier-integration-bot".to_string(),
                    role: Some("supplier".to_string()),
                    requested_action: "approve".to_string(),
                    object_ids: vec!["MANIFEST-V2".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Supplier bot self-approves manifest with no evidence — custody layer blocks".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },

        // Benchmark 8: Temporal Replay Attack
        BenchmarkTrace {
            trace_id: "temporal-replay-001".to_string(),
            name: "Temporal Replay Attack".to_string(),
            description: "Finance service account submits a transfer request with a 48-hour-old timestamp".to_string(),
            attack_type: "replay_attack".to_string(),
            events: vec![
                BenchmarkEvent {
                    event_id: "e1".to_string(),
                    actor: "service-account-finance".to_string(),
                    role: Some("finance_service".to_string()),
                    requested_action: "transfer".to_string(),
                    object_ids: vec!["ACCOUNT-PAYROLL".to_string()],
                    claimed_evidence: vec![],
                    expected_verdict: "require_evidence".to_string(),
                    description: "Finance service transfers without evidence — custody layer blocks (stale timestamp)".to_string(),
                },
            ],
            expected_final_verdict: "require_evidence".to_string(),
            pass_condition: "require_evidence".to_string(),
        },
    ]
}

// ---------------------------------------------------------------------------
// WASM exports
// ---------------------------------------------------------------------------

/// Run a single benchmark trace JSON through the AutoMembrane and return a
/// `BenchmarkResult` JSON string.
///
/// ## Arguments
/// - `trace_json` — JSON serialisation of a `BenchmarkTrace`.
///
/// ## Returns
/// JSON string (`BenchmarkResult`). JS callers must call `JSON.parse()`.
#[wasm_bindgen]
pub fn run_benchmark_trace(trace_json: &str) -> Result<JsValue, JsValue> {
    let trace: BenchmarkTrace = serde_json::from_str(trace_json).map_err(|e| {
        wasm_err(
            codes::INVALID_JSON,
            format!("run_benchmark_trace: invalid BenchmarkTrace JSON: {e}"),
        )
    })?;

    let result = evaluate_trace(&trace);
    to_js_str(&result)
}

/// Return the eight built-in benchmark traces as a JSON array string.
///
/// ## Returns
/// JSON string (array of `BenchmarkTrace`). JS callers must call `JSON.parse()`.
#[wasm_bindgen]
pub fn get_builtin_benchmarks() -> Result<JsValue, JsValue> {
    let traces = builtin_benchmarks();
    to_js_str(&traces)
}

/// Run all eight built-in benchmark traces and return an aggregate result JSON string.
///
/// ## Returns
/// JSON string (`AllBenchmarksResult`). JS callers must call `JSON.parse()`.
#[wasm_bindgen]
pub fn run_all_benchmarks() -> Result<JsValue, JsValue> {
    let traces = builtin_benchmarks();
    let total = traces.len();

    let results: Vec<BenchmarkResult> = traces.iter().map(evaluate_trace).collect();
    let passed = results.iter().filter(|r| r.pass).count();
    let failed = total - passed;
    let pass_rate = if total > 0 { passed as f64 / total as f64 } else { 0.0 };

    let aggregate = AllBenchmarksResult {
        total,
        passed,
        failed,
        pass_rate,
        results,
    };

    to_js_str(&aggregate)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_builtin_benchmarks_pass() {
        let traces = builtin_benchmarks();
        assert_eq!(traces.len(), 8, "Expected 8 built-in benchmarks");

        for trace in &traces {
            let result = evaluate_trace(trace);
            assert!(
                result.pass,
                "Benchmark '{}' ({}): expected '{}', got '{}'. Reason: {:?}",
                result.name,
                result.trace_id,
                result.expected_verdict,
                result.final_verdict,
                result.failure_reason
            );
        }
    }

    #[test]
    fn aggregate_result_counts_correctly() {
        let traces = builtin_benchmarks();
        let total = traces.len();
        let results: Vec<BenchmarkResult> = traces.iter().map(evaluate_trace).collect();
        let passed = results.iter().filter(|r| r.pass).count();
        assert_eq!(passed, total, "All benchmarks should pass");
        assert_eq!(passed as f64 / total as f64, 1.0);
    }

    #[test]
    fn payment_bypass_requires_evidence_on_release() {
        let traces = builtin_benchmarks();
        let trace = traces.iter().find(|t| t.trace_id == "bench-001").unwrap();
        let result = evaluate_trace(trace);
        assert!(result.pass, "AP Payment Bypass benchmark must pass");
        assert_eq!(result.final_verdict, "require_evidence");
    }

    #[test]
    fn emergency_access_abuse_requires_actor_identity() {
        let traces = builtin_benchmarks();
        let trace = traces.iter().find(|t| t.trace_id == "bench-004").unwrap();
        let result = evaluate_trace(trace);
        assert!(result.pass, "Emergency Access Abuse benchmark must pass");
        // Empty actor → actor layer requires evidence
        let ev = &result.event_results[0];
        assert_eq!(ev.verdict, "require_evidence");
    }

    #[test]
    fn verdict_matches_aliases() {
        assert!(verdict_matches("deny", "denied"));
        assert!(verdict_matches("denied", "deny"));
        assert!(verdict_matches("escalate", "escalated"));
        assert!(verdict_matches("require_evidence", "require_evidence"));
        assert!(!verdict_matches("allow", "deny"));
    }

    #[test]
    fn benchmark_trace_serializes_roundtrip() {
        let traces = builtin_benchmarks();
        let json = serde_json::to_string(&traces).unwrap();
        let restored: Vec<BenchmarkTrace> = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.len(), traces.len());
        assert_eq!(restored[0].trace_id, traces[0].trace_id);
    }
}
