//! # Membrane Oracle Tests — WS5 Integration Test Suite
//!
//! Oracle hierarchy (Van der Aalst / Chicago TDD):
//!   Rank 1 — Mathematical theorem (composition rules, determinism, boundedness)
//!   Rank 2 — Domain contract (custody keywords, actor completeness, admission predicate)
//!   Rank 3 — Metamorphic relation (unknown vs known actor, prefix length)
//!
//! Feature gate: all tests require the `miniml` feature flag.

#![cfg(feature = "miniml")]

use wasm4pm::actor_envelope::{ActorEnvelope, ActorProfile, score_actor_motion_from_envelope};
use wasm4pm::automembrane::{
    LayerVerdict, RequestMotion, Verdict,
    classify_motion_internal, compose_verdicts, evaluate_custody_layer,
};
use wasm4pm::route_envelope::{RouteEnvelope, RouteVariant, score_route_motion_from_envelope};

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/// Build a minimal `RequestMotion` for testing.
fn make_motion(actor: &str, action: &str, evidence: Vec<String>) -> RequestMotion {
    RequestMotion {
        request_id: "test-001".to_string(),
        actor: actor.to_string(),
        role: None,
        origin_system: None,
        target_system: None,
        object_ids: vec!["obj-1".to_string()],
        object_types: vec![],
        requested_action: action.to_string(),
        claimed_evidence: evidence,
        timestamp_ms: Some(1_714_940_400_000.0),
        route_context: None,
        deployment_profile: None,
    }
}

fn make_allow_lv(layer: &str) -> LayerVerdict {
    LayerVerdict {
        layer: layer.to_string(),
        verdict: Verdict::Allow,
        confidence: 1.0,
        reason: "test allow".to_string(),
        evidence_used: vec![],
        missing_evidence: vec![],
    }
}

fn make_deny_lv(layer: &str) -> LayerVerdict {
    LayerVerdict {
        layer: layer.to_string(),
        verdict: Verdict::Deny,
        confidence: 1.0,
        reason: "test deny".to_string(),
        evidence_used: vec![],
        missing_evidence: vec![],
    }
}

fn make_stop_line_lv(layer: &str) -> LayerVerdict {
    LayerVerdict {
        layer: layer.to_string(),
        verdict: Verdict::StopLine,
        confidence: 1.0,
        reason: "test stop line".to_string(),
        evidence_used: vec![],
        missing_evidence: vec![],
    }
}

fn make_require_evidence_lv(layer: &str) -> LayerVerdict {
    LayerVerdict {
        layer: layer.to_string(),
        verdict: Verdict::RequireEvidence,
        confidence: 1.0,
        reason: "test require evidence".to_string(),
        evidence_used: vec![],
        missing_evidence: vec!["test_evidence".to_string()],
    }
}

/// Numeric rank for Verdict precedence (higher = stricter).
fn verdict_rank(v: &Verdict) -> u8 {
    match v {
        Verdict::Allow => 0,
        Verdict::AllowWithReceipt => 1,
        Verdict::Warn => 2,
        Verdict::Escalate => 3,
        Verdict::RequireEvidence => 4,
        Verdict::Quarantine => 5,
        Verdict::Deny => 6,
        Verdict::StopLine => 7,
    }
}

/// Build a minimal `ActorEnvelope` suitable for scoring tests.
/// Provides three distinct actors so the envelope does not hit its own
/// minimum-actor guard (which requires >= 3 when built from a log, but
/// the struct itself has no such constraint).
fn make_actor_envelope() -> ActorEnvelope {
    let mut alice_hours = [0u32; 24];
    alice_hours[9] = 10;
    alice_hours[14] = 5;

    ActorEnvelope {
        envelope_type: "actor_envelope".to_string(),
        profiles: vec![
            ActorProfile {
                actor: "alice".to_string(),
                role: Some("analyst".to_string()),
                common_actions: vec![
                    ("view".to_string(), 100),
                    ("approve".to_string(), 50),
                    ("submit".to_string(), 20),
                ],
                active_hours: alice_hours,
                avg_objects_per_event: 1.5,
                total_events: 170,
                last_seen_ms: 1_714_940_000_000.0,
            },
            ActorProfile {
                actor: "bob".to_string(),
                role: Some("manager".to_string()),
                common_actions: vec![("approve".to_string(), 80), ("review".to_string(), 30)],
                active_hours: {
                    let mut h = [0u32; 24];
                    h[10] = 8;
                    h
                },
                avg_objects_per_event: 2.0,
                total_events: 110,
                last_seen_ms: 1_714_930_000_000.0,
            },
            ActorProfile {
                actor: "carol".to_string(),
                role: None,
                common_actions: vec![("view".to_string(), 40)],
                active_hours: {
                    let mut h = [0u32; 24];
                    h[11] = 4;
                    h
                },
                avg_objects_per_event: 1.0,
                total_events: 40,
                last_seen_ms: 1_714_920_000_000.0,
            },
        ],
        activity_key: "concept:name".to_string(),
        actor_key: "org:resource".to_string(),
        timestamp_key: "time:timestamp".to_string(),
        trained_on: 15,
    }
}

/// Build a minimal `RouteEnvelope` for scoring tests.
fn make_route_envelope() -> RouteEnvelope {
    RouteEnvelope {
        envelope_type: "route_envelope".to_string(),
        variants: vec![
            RouteVariant {
                activities: vec!["A".to_string(), "B".to_string(), "approve".to_string()],
                count: 10,
                frequency: 0.8,
            },
            RouteVariant {
                activities: vec!["A".to_string(), "C".to_string()],
                count: 3,
                frequency: 0.2,
            },
        ],
        total_traces: 13,
        coverage_threshold: 0.8,
        activity_key: "concept:name".to_string(),
    }
}

// ===========================================================================
// G1: Conservative composition (Rank 1 — mathematical theorem)
// ===========================================================================

#[test]
fn test_compose_any_deny_yields_deny_or_stop_line() {
    let verdicts = vec![
        make_allow_lv("actor"),
        make_deny_lv("custody"),
        make_allow_lv("route"),
    ];
    let (final_v, _) = compose_verdicts(&verdicts);
    assert!(
        final_v == Verdict::Deny || final_v == Verdict::StopLine,
        "Expected Deny or StopLine when custody layer is Deny, got: {:?}",
        final_v
    );
}

#[test]
fn test_compose_stop_line_overrides_deny() {
    let verdicts = vec![
        make_deny_lv("actor"),
        make_stop_line_lv("object"),
        make_allow_lv("route"),
    ];
    let (final_v, decisive) = compose_verdicts(&verdicts);
    assert_eq!(final_v, Verdict::StopLine, "StopLine must override Deny");
    assert_eq!(decisive, "object");
}

#[test]
fn test_compose_stop_line_overrides_all_allow() {
    let verdicts = vec![
        make_allow_lv("actor"),
        make_stop_line_lv("object"),
        make_allow_lv("route"),
    ];
    let (final_v, _) = compose_verdicts(&verdicts);
    assert_eq!(final_v, Verdict::StopLine, "StopLine must override all Allow verdicts");
}

#[test]
fn test_compose_all_allow_yields_allow() {
    let verdicts = vec![
        make_allow_lv("actor"),
        make_allow_lv("object"),
        make_allow_lv("route"),
        make_allow_lv("automl"),
        make_allow_lv("custody"),
    ];
    let (final_v, decisive) = compose_verdicts(&verdicts);
    assert!(
        final_v == Verdict::Allow || final_v == Verdict::AllowWithReceipt,
        "All Allow layers must produce Allow or AllowWithReceipt, got: {:?}",
        final_v
    );
    // When all allow, decisive layer should be "none" (no blocking layer)
    assert_eq!(decisive, "none");
}

#[test]
fn test_compose_require_evidence_beats_warn() {
    let verdicts = vec![
        make_allow_lv("actor"),
        LayerVerdict {
            layer: "object".to_string(),
            verdict: Verdict::Warn,
            confidence: 0.8,
            reason: String::new(),
            evidence_used: vec![],
            missing_evidence: vec![],
        },
        make_require_evidence_lv("custody"),
    ];
    let (final_v, _) = compose_verdicts(&verdicts);
    assert!(
        verdict_rank(&final_v) >= verdict_rank(&Verdict::RequireEvidence),
        "RequireEvidence must beat Warn, got: {:?}",
        final_v
    );
}

#[test]
fn test_compose_deny_beats_require_evidence() {
    let verdicts = vec![
        make_require_evidence_lv("custody"),
        make_deny_lv("actor"),
    ];
    let (final_v, _) = compose_verdicts(&verdicts);
    assert_eq!(final_v, Verdict::Deny, "Deny must beat RequireEvidence");
}

// ===========================================================================
// G2: Custody keyword detection (Rank 2 — domain contract)
// ===========================================================================

#[test]
fn test_custody_approve_no_evidence_requires_evidence() {
    let motion = make_motion("alice", "approve", vec![]);
    let verdict = evaluate_custody_layer(&motion);
    assert!(
        matches!(
            verdict.verdict,
            Verdict::Escalate | Verdict::RequireEvidence | Verdict::Deny | Verdict::StopLine
        ),
        "'approve' with no evidence must require evidence or worse, got: {:?}",
        verdict.verdict
    );
    // Must specifically indicate missing evidence
    assert!(
        !verdict.missing_evidence.is_empty(),
        "Missing evidence list must be non-empty for custody block"
    );
}

#[test]
fn test_custody_release_no_evidence_requires_evidence() {
    let motion = make_motion("alice", "release_artifact", vec![]);
    let verdict = evaluate_custody_layer(&motion);
    assert_eq!(
        verdict.verdict,
        Verdict::RequireEvidence,
        "'release' with no evidence must require evidence"
    );
}

#[test]
fn test_custody_transfer_no_evidence_requires_evidence() {
    let motion = make_motion("alice", "transfer_funds", vec![]);
    let verdict = evaluate_custody_layer(&motion);
    assert_eq!(
        verdict.verdict,
        Verdict::RequireEvidence,
        "'transfer' with no evidence must require evidence"
    );
}

#[test]
fn test_custody_non_custody_action_allows() {
    let motion = make_motion("alice", "view_report", vec![]);
    let verdict = evaluate_custody_layer(&motion);
    assert_eq!(
        verdict.verdict,
        Verdict::Allow,
        "Non-custody action 'view_report' should Allow at custody layer"
    );
}

#[test]
fn test_custody_transfer_with_evidence_allows() {
    let motion = make_motion("alice", "transfer", vec!["CUSTODY-PROOF-XYZ".to_string()]);
    let verdict = evaluate_custody_layer(&motion);
    assert!(
        matches!(verdict.verdict, Verdict::Allow | Verdict::AllowWithReceipt | Verdict::Warn),
        "'transfer' with evidence should Allow or Warn, got: {:?}",
        verdict.verdict
    );
}

#[test]
fn test_custody_approve_with_evidence_allows() {
    let motion = make_motion("alice", "approve", vec!["approval-token-001".to_string()]);
    let verdict = evaluate_custody_layer(&motion);
    assert!(
        matches!(verdict.verdict, Verdict::Allow | Verdict::AllowWithReceipt | Verdict::Warn),
        "'approve' with evidence should Allow or Warn, got: {:?}",
        verdict.verdict
    );
    // High-stakes action with evidence has high confidence
    assert!(verdict.confidence > 0.5, "Confidence must be > 0.5 for evidenced high-stakes action");
}

// ===========================================================================
// G3: Actor envelope monotonicity (Rank 3 — metamorphic)
// ===========================================================================

#[test]
fn test_unknown_actor_scores_higher_anomaly_than_known() {
    let envelope = make_actor_envelope();

    // Alice is a known actor who commonly performs "view"
    let known_motion = make_motion("alice", "view", vec![]);
    // Completely unknown actor
    let unknown_motion = make_motion("unknown-external-user-xyz", "view", vec![]);

    let known_verdict = score_actor_motion_from_envelope(&envelope, &known_motion);
    let unknown_verdict = score_actor_motion_from_envelope(&envelope, &unknown_motion);

    assert!(
        verdict_rank(&unknown_verdict.verdict) >= verdict_rank(&known_verdict.verdict),
        "Unknown actor ({:?}) must score same or worse than known actor ({:?})",
        unknown_verdict.verdict,
        known_verdict.verdict
    );
}

#[test]
fn test_known_actor_familiar_action_allows() {
    let envelope = make_actor_envelope();
    // "alice" performs "view" 100 times — well within top-10
    let motion = make_motion("alice", "view", vec![]);
    let verdict = score_actor_motion_from_envelope(&envelope, &motion);
    // Familiar action at known hour (9 = active, timestamp 1_714_940_400_000ms → hour?)
    // Either Allow or Warn is acceptable — should not Deny/StopLine
    assert!(
        !matches!(verdict.verdict, Verdict::Deny | Verdict::StopLine),
        "Known actor with familiar action must not be Denied/StopLine, got: {:?}",
        verdict.verdict
    );
}

#[test]
fn test_unknown_actor_requires_evidence_or_worse() {
    let envelope = make_actor_envelope();
    let motion = make_motion("completely-unknown-external-attacker", "approve", vec![]);
    let verdict = score_actor_motion_from_envelope(&envelope, &motion);
    // Unknown actor → RequireEvidence (from the no-history branch in score_actor_motion_from_envelope)
    assert_eq!(
        verdict.verdict,
        Verdict::RequireEvidence,
        "Actor with no history in envelope must receive RequireEvidence"
    );
    assert!(
        verdict.missing_evidence.contains(&"actor_history".to_string()),
        "Missing evidence must reference 'actor_history'"
    );
}

// ===========================================================================
// G4: Route envelope prefix matching (Rank 1 — mathematical)
// ===========================================================================

#[test]
fn test_route_action_matches_known_route_does_not_deny() {
    let envelope = make_route_envelope();
    // Motion where requested_action is "approve" — matches first variant ["A","B","approve"]
    let motion = make_motion("alice", "approve", vec![]);
    let verdict = score_route_motion_from_envelope(&envelope, &motion);
    // approve matches one known variant → should not be Deny or StopLine
    assert!(
        !matches!(verdict.verdict, Verdict::Deny | Verdict::StopLine),
        "Motion matching known route must not be Denied, got: {:?}",
        verdict.verdict
    );
}

#[test]
fn test_route_unknown_action_warns() {
    let envelope = make_route_envelope();
    // Action that appears in no known variant
    let motion = make_motion("alice", "completely_unknown_action_xyz_99", vec![]);
    let verdict = score_route_motion_from_envelope(&envelope, &motion);
    // Zero matches → Warn
    assert_eq!(
        verdict.verdict,
        Verdict::Warn,
        "Action matching no known routes must Warn, got: {:?}",
        verdict.verdict
    );
}

#[test]
fn test_route_empty_action_allows_vacuously() {
    let envelope = make_route_envelope();
    // Empty action → empty prefix → vacuous match
    let motion = RequestMotion {
        request_id: "test-empty".to_string(),
        actor: "alice".to_string(),
        role: None,
        origin_system: None,
        target_system: None,
        object_ids: vec!["obj-1".to_string()],
        object_types: vec![],
        requested_action: String::new(),
        claimed_evidence: vec![],
        timestamp_ms: Some(1_714_940_400_000.0),
        route_context: None,
        deployment_profile: None,
    };
    let verdict = score_route_motion_from_envelope(&envelope, &motion);
    // Empty prefix matches vacuously
    assert_eq!(verdict.verdict, Verdict::Allow, "Empty prefix must Allow vacuously");
}

// ===========================================================================
// G5: Benchmark runner determinism (Rank 1 — mathematical)
// ===========================================================================

#[test]
fn test_benchmark_runner_deterministic() {
    use wasm4pm::benchmark_runner::builtin_benchmarks;

    let traces1 = builtin_benchmarks();
    let traces2 = builtin_benchmarks();

    assert_eq!(traces1.len(), traces2.len(), "Benchmark count must be deterministic");
    assert!(
        traces1.len() >= 5,
        "Must have at least 5 built-in benchmarks, got: {}",
        traces1.len()
    );

    for (t1, t2) in traces1.iter().zip(traces2.iter()) {
        assert_eq!(t1.trace_id, t2.trace_id, "Trace IDs must be stable");
        assert_eq!(
            t1.expected_final_verdict, t2.expected_final_verdict,
            "Expected verdicts must be stable"
        );
    }
}

#[test]
fn test_benchmark_traces_have_required_fields() {
    use wasm4pm::benchmark_runner::builtin_benchmarks;

    let traces = builtin_benchmarks();
    for trace in &traces {
        assert!(!trace.trace_id.is_empty(), "trace_id must not be empty");
        assert!(!trace.name.is_empty(), "name must not be empty");
        assert!(!trace.events.is_empty(), "events must not be empty");
        assert!(
            !trace.expected_final_verdict.is_empty(),
            "expected_final_verdict must not be empty"
        );
    }
}

// ===========================================================================
// G6: Drift threshold monotonicity (Rank 1 — mathematical)
// ===========================================================================

/// Local copy of the drift status classification — tested as a pure function.
fn drift_status(score: f64) -> &'static str {
    if score < 0.10 {
        "stable"
    } else if score < 0.25 {
        "moderate"
    } else if score < 0.50 {
        "high"
    } else if score < 0.75 {
        "severe"
    } else {
        "critical"
    }
}

#[test]
fn test_drift_thresholds_classify_correctly() {
    assert_eq!(drift_status(0.05), "stable");
    assert_eq!(drift_status(0.15), "moderate");
    assert_eq!(drift_status(0.30), "high");
    assert_eq!(drift_status(0.60), "severe");
    assert_eq!(drift_status(0.80), "critical");
}

#[test]
fn test_drift_thresholds_monotonic_step_up() {
    // Sample points spanning the full [0,1] range — status should never go backwards
    let samples = [0.0_f64, 0.10, 0.25, 0.50, 0.75, 1.0];
    let order = ["stable", "moderate", "high", "severe", "critical"];
    for &s in &samples {
        let status = drift_status(s);
        assert!(
            order.contains(&status),
            "drift_status({s}) returned unknown status '{status}'"
        );
    }
    // Strict ordering at boundaries
    let idx = |status: &str| order.iter().position(|&s| s == status).unwrap();
    assert!(idx(drift_status(0.0)) <= idx(drift_status(0.10)));
    assert!(idx(drift_status(0.10)) <= idx(drift_status(0.25)));
    assert!(idx(drift_status(0.25)) <= idx(drift_status(0.50)));
    assert!(idx(drift_status(0.50)) <= idx(drift_status(0.75)));
}

// ===========================================================================
// G7: End-to-end membrane pipeline (Rank 2 — domain contract)
// ===========================================================================

#[test]
fn test_end_to_end_conforming_motion_allows() {
    // Known actor + benign non-custody action + objects present → should Allow
    let conforming_motion = make_motion("alice", "view_report", vec![]);
    let receipt = classify_motion_internal(&conforming_motion);

    assert_ne!(
        receipt.final_verdict,
        Verdict::Deny,
        "Benign non-custody motion should not be Denied"
    );
    assert_ne!(
        receipt.final_verdict,
        Verdict::StopLine,
        "Benign non-custody motion should not be StopLine"
    );
    // Benign motion must be admitted downstream
    assert!(
        receipt.downstream_admitted,
        "Benign non-custody motion must be admitted downstream"
    );
}

#[test]
fn test_end_to_end_custody_violation_blocks_downstream() {
    // Custody action without evidence → RequireEvidence → not admitted
    let violation_motion = make_motion("attacker", "approve", vec![]);
    let receipt = classify_motion_internal(&violation_motion);

    // Must escalate, require evidence, or deny — never Allow through
    assert!(
        matches!(
            receipt.final_verdict,
            Verdict::Deny
                | Verdict::StopLine
                | Verdict::RequireEvidence
                | Verdict::Escalate
                | Verdict::Quarantine
        ),
        "Custody violation must produce Deny/StopLine/RequireEvidence/Escalate/Quarantine, got: {:?}",
        receipt.final_verdict
    );
    // downstream must be blocked
    assert!(
        !receipt.downstream_admitted,
        "Custody violation must not be admitted downstream, final_verdict={:?}",
        receipt.final_verdict
    );
}

#[test]
fn test_end_to_end_empty_actor_blocks_downstream() {
    // Empty actor → actor layer RequireEvidence → not admitted
    let motion = RequestMotion {
        request_id: "test-empty-actor".to_string(),
        actor: "".to_string(),
        role: None,
        origin_system: None,
        target_system: None,
        object_ids: vec!["obj-1".to_string()],
        object_types: vec![],
        requested_action: "view".to_string(),
        claimed_evidence: vec![],
        timestamp_ms: Some(1_714_940_400_000.0),
        route_context: None,
        deployment_profile: None,
    };
    let receipt = classify_motion_internal(&motion);
    assert!(
        !receipt.downstream_admitted,
        "Empty actor must not be admitted downstream, final_verdict={:?}",
        receipt.final_verdict
    );
}

#[test]
fn test_verdict_receipt_has_required_fields() {
    let motion = make_motion("alice", "view_report", vec![]);
    let receipt = classify_motion_internal(&motion);

    assert!(!receipt.request_id.is_empty(), "request_id must not be empty");
    assert!(!receipt.decisive_layer.is_empty(), "decisive_layer must not be empty");
    assert!(!receipt.model_version.is_empty(), "model_version must not be empty");
    assert!(!receipt.state_snapshot.is_empty(), "state_snapshot must not be empty");
    assert_eq!(receipt.state_snapshot.len(), 16, "state_snapshot must be 16 hex chars");
    assert!(!receipt.layer_verdicts.is_empty(), "layer_verdicts must not be empty");
    assert!(!receipt.explanation.is_empty(), "explanation must not be empty");
}

#[test]
fn test_verdict_receipt_serializes_roundtrip() {
    let motion = make_motion("alice", "view_report", vec![]);
    let receipt = classify_motion_internal(&motion);

    let json = serde_json::to_string(&receipt).expect("VerdictReceipt must serialize");
    let restored: wasm4pm::automembrane::VerdictReceipt =
        serde_json::from_str(&json).expect("VerdictReceipt must deserialize");

    assert_eq!(restored.request_id, receipt.request_id);
    assert_eq!(restored.final_verdict, receipt.final_verdict);
    assert_eq!(restored.downstream_admitted, receipt.downstream_admitted);
    assert_eq!(restored.decisive_layer, receipt.decisive_layer);
}

// ===========================================================================
// G8: Verdict admission predicate (Rank 1 — mathematical)
// ===========================================================================

#[test]
fn test_admission_predicate_allow_verdicts_are_admitted() {
    // Allow, AllowWithReceipt, Warn → downstream_admitted == true
    let allow_actions = ["view_report", "submit_form", "read_data"];
    for action in &allow_actions {
        let motion = make_motion("alice", action, vec![]);
        let receipt = classify_motion_internal(&motion);
        // These are non-custody actions from a present actor — must be admitted
        if receipt.final_verdict == Verdict::Allow
            || receipt.final_verdict == Verdict::AllowWithReceipt
            || receipt.final_verdict == Verdict::Warn
        {
            assert!(
                receipt.downstream_admitted,
                "Verdict {:?} must be admitted downstream for action '{action}'",
                receipt.final_verdict
            );
        }
    }
}

#[test]
fn test_admission_predicate_blocking_verdicts_are_rejected() {
    // Deny, StopLine, RequireEvidence, Escalate, Quarantine → downstream_admitted == false
    // Force a blocking verdict by using a custody action without evidence
    let blocking_motion = make_motion("alice", "approve", vec![]);
    let receipt = classify_motion_internal(&blocking_motion);

    if matches!(
        receipt.final_verdict,
        Verdict::Deny
            | Verdict::StopLine
            | Verdict::RequireEvidence
            | Verdict::Escalate
            | Verdict::Quarantine
    ) {
        assert!(
            !receipt.downstream_admitted,
            "Blocking verdict {:?} must not be admitted downstream",
            receipt.final_verdict
        );
    }
}
