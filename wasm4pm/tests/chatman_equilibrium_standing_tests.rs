use serde_json::json;
use wasm4pm::receipt::{
    DiagnosticAudience, EquilibriumStandingReceipt, ReceiptDoctor, VerificationState,
};

const REPOSITORY: &str = "seanchatmangpt/wasm4pm";
const BASE_SHA: &str = "9fc4f1ae3cc99cf65a5f014580db8e1ea3d08b55";
const TTL: &str = include_str!("../../semconv/chatman-equilibrium-standing.ttl");

fn sparse_candidate() -> serde_json::Value {
    json!({"commit": BASE_SHA})
}

#[test]
fn ttl_is_load_bearing_for_the_standing_lattice() {
    for term in [
        "ce:UNKNOWN",
        "ce:REFUSED",
        "ce:ADMITTED",
        "ce:EvidenceIncomplete",
        "ce:IndependentPositiveEvidence",
        "ce:ExactSubjectMismatch",
        "ce:RepositoryLocalVerification",
        "ce:DeterministicStandingReplay",
        "ce:CrossSubjectReuse",
        "ce:ForgedReceiptHash",
        "ce:AuthorityLaundering",
        "ce:MissingIndependentEvidence",
    ] {
        assert!(TTL.contains(term), "participating TTL is missing {term}");
    }

    // The executable classifier's epistemic-missing vocabulary must be declared
    // by the ontology. This makes the TTL a court input rather than decoration.
    for code in [
        "ExpectedOCELMissing",
        "ObservedOCELMissing",
        "BoundaryEvidenceMissing",
        "RuntimeObserverMissing",
        "ChallengeNonceMissing",
    ] {
        assert!(TTL.contains(&format!("ce:{code} a ce:EvidenceIncomplete")));
    }
}

#[test]
fn missing_independent_evidence_is_unknown_not_admitted_or_refused() {
    let report = ReceiptDoctor::verify_with_audience(
        &sparse_candidate(),
        DiagnosticAudience::OperatorPrivate,
    );
    assert_eq!(report.state, VerificationState::Unknown);

    let standing = ReceiptDoctor::qualify_exact_subject(
        &sparse_candidate(),
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Unknown);
    assert_eq!(standing.authority, "NONE");
    assert!(!standing.do_authority);
    assert!(ReceiptDoctor::verify_standing_replay(&standing));
}

#[test]
fn cross_subject_reuse_is_refused_even_when_candidate_was_otherwise_unknown() {
    let candidate = json!({"commit": "1111111111111111111111111111111111111111"});
    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Refused);
    assert_eq!(
        standing.exact_subject,
        format!("{REPOSITORY}@{BASE_SHA}")
    );
}

#[test]
fn forged_root_receipt_hash_is_refused_not_unknown() {
    let candidate = json!({
        "commit": BASE_SHA,
        "receipt_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Refused);
}

#[test]
fn deterministic_replay_binds_subject_evidence_state_and_zero_authority() {
    let candidate = sparse_candidate();
    let a = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    let b = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(a, b);
    assert!(ReceiptDoctor::verify_standing_replay(&a));

    let mut forged_digest: EquilibriumStandingReceipt = a.clone();
    forged_digest.replay_digest.replace_range(..1, "0");
    if forged_digest.replay_digest == a.replay_digest {
        forged_digest.replay_digest.replace_range(..1, "1");
    }
    assert!(!ReceiptDoctor::verify_standing_replay(&forged_digest));

    let mut authority_laundered = a;
    authority_laundered.authority = "DO".to_string();
    authority_laundered.do_authority = true;
    assert!(!ReceiptDoctor::verify_standing_replay(&authority_laundered));
}

#[test]
fn malformed_mutable_subjects_are_not_qualifiable() {
    let candidate = sparse_candidate();

    assert_eq!(
        ReceiptDoctor::qualify_exact_subject(
            &candidate,
            DiagnosticAudience::OperatorPrivate,
            "wasm4pm",
            BASE_SHA,
        )
        .unwrap_err(),
        "repository_identity_invalid"
    );

    assert_eq!(
        ReceiptDoctor::qualify_exact_subject(
            &candidate,
            DiagnosticAudience::OperatorPrivate,
            REPOSITORY,
            "main",
        )
        .unwrap_err(),
        "immutable_base_sha_invalid"
    );
}


#[test]
fn semantic_key_order_does_not_change_evidence_or_replay_digest() {
    let mut left = serde_json::Map::new();
    left.insert("z".to_string(), json!(1));
    left.insert("commit".to_string(), json!(BASE_SHA));
    left.insert("a".to_string(), json!(2));

    let mut right = serde_json::Map::new();
    right.insert("a".to_string(), json!(2));
    right.insert("commit".to_string(), json!(BASE_SHA));
    right.insert("z".to_string(), json!(1));

    let l = ReceiptDoctor::qualify_exact_subject(
        &serde_json::Value::Object(left),
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    let r = ReceiptDoctor::qualify_exact_subject(
        &serde_json::Value::Object(right),
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(l.candidate_receipt_sha256, r.candidate_receipt_sha256);
    assert_eq!(l.doctor_report_hash, r.doctor_report_hash);
    assert_eq!(l.replay_digest, r.replay_digest);
    assert_eq!(l.state, VerificationState::Unknown);
}
