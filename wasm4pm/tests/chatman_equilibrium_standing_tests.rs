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
        "ce:RepositoryIdentityMissing",
        "ce:RepositoryIdentityMismatch",
        "ce:CommitIdentityMissing",
        "ce:CommitIdentityMismatch",
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
        "IndependentEvidenceMissing",
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


fn permutations<T: Clone>(items: &[T]) -> Vec<Vec<T>> {
    if items.is_empty() {
        return vec![Vec::new()];
    }
    let mut out = Vec::new();
    for index in 0..items.len() {
        let mut rest = items.to_vec();
        let head = rest.remove(index);
        for mut tail in permutations(&rest) {
            let mut permutation = vec![head.clone()];
            permutation.append(&mut tail);
            out.push(permutation);
        }
    }
    out
}

#[test]
fn all_24_semantic_key_permutations_have_one_standing_digest() {
    let entries = vec![
        ("commit".to_string(), json!(BASE_SHA)),
        ("a".to_string(), json!(1)),
        ("m".to_string(), json!("stable")),
        ("z".to_string(), json!(true)),
    ];

    let mut candidate_hashes = std::collections::BTreeSet::new();
    let mut doctor_hashes = std::collections::BTreeSet::new();
    let mut replay_digests = std::collections::BTreeSet::new();

    for order in permutations(&entries) {
        let mut map = serde_json::Map::new();
        for (key, value) in order {
            map.insert(key, value);
        }
        let standing = ReceiptDoctor::qualify_exact_subject(
            &serde_json::Value::Object(map),
            DiagnosticAudience::OperatorPrivate,
            REPOSITORY,
            BASE_SHA,
        )
        .unwrap();
        assert_eq!(standing.state, VerificationState::Unknown);
        candidate_hashes.insert(standing.candidate_receipt_sha256);
        doctor_hashes.insert(standing.doctor_report_hash);
        replay_digests.insert(standing.replay_digest);
    }

    assert_eq!(candidate_hashes.len(), 1, "candidate digest depends on key order");
    assert_eq!(doctor_hashes.len(), 1, "verifier digest depends on key order");
    assert_eq!(replay_digests.len(), 1, "replay digest depends on key order");
}


const PROCESS_OCEL: &str =
    include_str!("../../receipts/v26.9.26/chatman-equilibrium-standing.ocel.json");
const RUN_RECEIPT: &str =
    include_str!("../../receipts/v26.9.26/chatman-equilibrium-standing.receipt.json");
const SHACL_COURT_RECEIPT: &str =
    include_str!("../../receipts/v26.9.26/chatman-equilibrium-shacl-court.receipt.json");

#[test]
fn process_evidence_is_bounded_machine_readable_and_subject_bound() {
    let ocel: serde_json::Value = serde_json::from_str(PROCESS_OCEL).unwrap();
    let receipt: serde_json::Value = serde_json::from_str(RUN_RECEIPT).unwrap();

    assert_eq!(ocel["ocel:version"], "2.0");
    assert_eq!(
        receipt["subject"],
        format!("{REPOSITORY}@{BASE_SHA}")
    );
    assert_eq!(receipt["authority"], "NONE");
    assert_eq!(receipt["do_authority"], false);
    assert_eq!(receipt["evidence"]["cargo_execution"]["standing"], "UNKNOWN");
    assert_eq!(receipt["evidence"]["hosted_ci"]["standing"], "UNKNOWN");
    assert_eq!(receipt["evidence"]["shacl_core_logic"]["standing"], "ALIVE");
    assert_eq!(receipt["evidence"]["shacl_core_logic"]["killed"], 9);
    assert_eq!(receipt["evidence"]["shacl_core_logic"]["total"], 9);
    assert_eq!(receipt["evidence"]["node_module_execution"]["standing"], "UNKNOWN");
    assert_eq!(receipt["standing"], "PARTIAL_ALIVE");

    let objects = ocel["objects"].as_array().unwrap();
    let known_ids = objects
        .iter()
        .filter_map(|object| object["id"].as_str())
        .collect::<std::collections::BTreeSet<_>>();

    let events = ocel["events"].as_array().unwrap();
    let expected_types = [
        "subject.reconstruct",
        "dod.freeze",
        "standing.mutate",
        "falsifier.run",
        "replay.verify",
        "pr.open",
        "court.execute",
    ];
    assert_eq!(events.len(), expected_types.len());

    let mut previous = "";
    for (event, expected_type) in events.iter().zip(expected_types) {
        assert_eq!(event["type"], expected_type);
        let timestamp = event["time"].as_str().unwrap();
        assert!(previous <= timestamp, "OCEL events must be monotonically ordered");
        previous = timestamp;

        for relationship in event["relationships"].as_array().unwrap() {
            let object_id = relationship["objectId"].as_str().unwrap();
            assert!(known_ids.contains(object_id), "dangling OCEL object reference");
        }
    }

    assert_eq!(
        receipt["process_evidence"],
        "receipts/v26.9.26/chatman-equilibrium-standing.ocel.json"
    );
}


#[test]
fn empty_algorithm_set_is_unknown_not_admitted() {
    let candidate = json!({
        "commit": BASE_SHA,
        "algorithms": []
    });

    let report = ReceiptDoctor::verify_with_audience(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
    );
    assert_eq!(report.state, VerificationState::Unknown);

    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(standing.state, VerificationState::Unknown);
}

#[test]
fn independently_evidenced_exact_subject_can_reach_admitted() {
    let candidate = json!({
        "repository_identity": REPOSITORY,
        "commit": BASE_SHA,
        "algorithms": [{
            "id": "positive-evidence",
            "expected_path": {
                "expected_ocel2": {
                    "events": [{
                        "id": "expected-1",
                        "type": "expected.step",
                        "timestamp": "2026-09-26T18:00:00Z"
                    }],
                    "objects": [{"id": "case-1", "type": "Case"}]
                }
            },
            "observed_path": {
                "observed_ocel2": {
                    "events": [{
                        "id": "observed-1",
                        "type": "observed.step",
                        "timestamp": "2026-09-26T18:00:01Z"
                    }],
                    "objects": [{"id": "case-1", "type": "Case"}]
                }
            },
            "boundary_evidence": {
                "exit_code": 0,
                "command": "wpm receipt doctor"
            }
        }]
    });

    let report = ReceiptDoctor::verify_with_audience(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
    );
    assert_eq!(
        report.state,
        VerificationState::Admitted,
        "positive evidence fixture should have no deny findings: {:?}",
        report.operator_private.findings
    );

    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(standing.state, VerificationState::Admitted);
    assert!(ReceiptDoctor::verify_standing_replay(&standing));
    assert_eq!(standing.authority, "NONE");
    assert!(!standing.do_authority);
}


#[test]
fn same_commit_from_another_repository_is_refused() {
    let candidate = json!({
        "repository_identity": "seanchatmangpt/not-wasm4pm",
        "commit": BASE_SHA
    });
    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Refused);
    assert_eq!(standing.subject_binding, "REFUSED_REPOSITORY_MISMATCH");
}

#[test]
fn missing_subject_identity_never_downgrades_existing_refusal_to_unknown() {
    let forged = json!({
        "receipt_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    let standing = ReceiptDoctor::qualify_exact_subject(
        &forged,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Refused);
    assert_eq!(standing.subject_binding, "UNKNOWN_REPOSITORY");
    assert!(ReceiptDoctor::verify_standing_replay(&standing));
}

#[test]
fn positive_admission_is_lost_when_repository_binding_is_removed() {
    let candidate = json!({
        "commit": BASE_SHA,
        "algorithms": [{
            "id": "positive-evidence",
            "expected_path": {
                "expected_ocel2": {
                    "events": [{"id": "expected-1", "type": "expected.step", "timestamp": "2026-09-26T18:00:00Z"}],
                    "objects": [{"id": "case-1", "type": "Case"}]
                }
            },
            "observed_path": {
                "observed_ocel2": {
                    "events": [{"id": "observed-1", "type": "observed.step", "timestamp": "2026-09-26T18:00:01Z"}],
                    "objects": [{"id": "case-1", "type": "Case"}]
                }
            },
            "boundary_evidence": {"exit_code": 0, "command": "wpm receipt doctor"}
        }]
    });

    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    assert_eq!(standing.state, VerificationState::Unknown);
    assert_eq!(standing.subject_binding, "UNKNOWN_REPOSITORY");
}


#[test]
fn recomputed_hash_cannot_launder_incoherent_admitted_subject_binding() {
    let candidate = json!({
        "repository_identity": REPOSITORY,
        "commit": BASE_SHA
    });
    let mut forged = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    // The original sparse candidate is UNKNOWN. Forge an ADMITTED state with an
    // unbound repository and then recompute the public integrity hash.
    forged.state = VerificationState::Admitted;
    forged.subject_binding = "UNKNOWN_REPOSITORY".to_string();
    forged.replay_digest = ReceiptDoctor::recompute_standing_replay_digest(&forged);

    assert!(
        !ReceiptDoctor::verify_standing_replay(&forged),
        "hash equality must not substitute for semantic admission"
    );
}

#[test]
fn replay_verifier_rejects_schema_scope_subject_and_digest_shape_tampering() {
    let candidate = json!({
        "repository_identity": REPOSITORY,
        "commit": BASE_SHA
    });
    let original = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    let mut schema = original.clone();
    schema.schema = "attacker.schema/1".to_string();
    schema.replay_digest = ReceiptDoctor::recompute_standing_replay_digest(&schema);
    assert!(!ReceiptDoctor::verify_standing_replay(&schema));

    let mut scope = original.clone();
    scope.verification_scope = "production".to_string();
    scope.replay_digest = ReceiptDoctor::recompute_standing_replay_digest(&scope);
    assert!(!ReceiptDoctor::verify_standing_replay(&scope));

    let mut subject = original.clone();
    subject.exact_subject = "seanchatmangpt/wasm4pm@main".to_string();
    subject.replay_digest = ReceiptDoctor::recompute_standing_replay_digest(&subject);
    assert!(!ReceiptDoctor::verify_standing_replay(&subject));

    let mut candidate_digest = original.clone();
    candidate_digest.candidate_receipt_sha256 = "abc".to_string();
    candidate_digest.replay_digest =
        ReceiptDoctor::recompute_standing_replay_digest(&candidate_digest);
    assert!(!ReceiptDoctor::verify_standing_replay(&candidate_digest));

    let mut verifier_digest = original;
    verifier_digest.doctor_report_hash = "G".repeat(64);
    verifier_digest.replay_digest =
        ReceiptDoctor::recompute_standing_replay_digest(&verifier_digest);
    assert!(!ReceiptDoctor::verify_standing_replay(&verifier_digest));
}


#[test]
fn every_single_nibble_commit_mutation_is_refused() {
    let chars = BASE_SHA.as_bytes();
    for index in 0..chars.len() {
        let replacement = if chars[index] == b'0' { '1' } else { '0' };
        let mut mutated = BASE_SHA.to_string();
        mutated.replace_range(index..index + 1, &replacement.to_string());

        let candidate = json!({
            "repository_identity": REPOSITORY,
            "commit": mutated
        });
        let standing = ReceiptDoctor::qualify_exact_subject(
            &candidate,
            DiagnosticAudience::OperatorPrivate,
            REPOSITORY,
            BASE_SHA,
        )
        .unwrap();

        assert_eq!(
            standing.state,
            VerificationState::Refused,
            "commit mutation at nibble {index} escaped exact-subject refusal"
        );
        assert_eq!(standing.subject_binding, "REFUSED_COMMIT_MISMATCH");
    }
}

#[test]
fn replay_is_stable_across_1024_requalifications() {
    let candidate = json!({
        "repository_identity": REPOSITORY,
        "commit": BASE_SHA
    });
    let first = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();

    for iteration in 0..1024 {
        let observed = ReceiptDoctor::qualify_exact_subject(
            &candidate,
            DiagnosticAudience::OperatorPrivate,
            REPOSITORY,
            BASE_SHA,
        )
        .unwrap();
        assert_eq!(
            observed, first,
            "deterministic qualification diverged at iteration {iteration}"
        );
        assert!(ReceiptDoctor::verify_standing_replay(&observed));
    }
}

#[test]
fn evidence_absence_cannot_promote_and_subject_absence_cannot_hide_refusal() {
    let absent_evidence = json!({
        "repository_identity": REPOSITORY,
        "commit": BASE_SHA,
        "algorithms": []
    });
    let unknown = ReceiptDoctor::qualify_exact_subject(
        &absent_evidence,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(unknown.state, VerificationState::Unknown);

    let contradictory_without_subject = json!({
        "receipt_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    let refused = ReceiptDoctor::qualify_exact_subject(
        &contradictory_without_subject,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(refused.state, VerificationState::Refused);

    let cross_subject = json!({
        "repository_identity": "seanchatmangpt/other",
        "commit": BASE_SHA,
        "algorithms": []
    });
    let refused_cross_subject = ReceiptDoctor::qualify_exact_subject(
        &cross_subject,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(refused_cross_subject.state, VerificationState::Refused);
}


#[test]
fn shacl_court_receipt_is_provenance_bound_and_zero_authority() {
    let receipt: serde_json::Value = serde_json::from_str(SHACL_COURT_RECEIPT).unwrap();

    assert_eq!(
        receipt["subject"],
        format!("{REPOSITORY}@{BASE_SHA}")
    );
    assert_eq!(receipt["validator"]["path"], "src/validate-shacl.mjs");
    assert_eq!(
        receipt["validator"]["blob_sha"],
        "17f7aaede8020528696d033582c6561be5f537b9"
    );
    assert_eq!(receipt["shapes"]["path"], "semconv/wasm4pm-shapes.ttl");
    assert_eq!(
        receipt["shapes"]["blob_sha"],
        "cbd30db93c8888475e92c88d24ee2a8f8b540bfc"
    );
    assert_eq!(receipt["execution"]["killed"], 9);
    assert_eq!(receipt["execution"]["total"], 9);
    assert_eq!(receipt["authority"], "NONE");
    assert_eq!(receipt["do_authority"], false);
    assert_eq!(receipt["standing"], "ALIVE");
    assert_eq!(
        receipt["standing_scope"],
        "exact-source-shacl-core-logic"
    );
}


#[test]
fn uppercase_sha_aliases_are_not_admitted_subject_identity() {
    let upper = BASE_SHA.to_ascii_uppercase();
    let candidate = json!({
        "repository_identity": REPOSITORY,
        "commit": upper
    });

    let standing = ReceiptDoctor::qualify_exact_subject(
        &candidate,
        DiagnosticAudience::OperatorPrivate,
        REPOSITORY,
        BASE_SHA,
    )
    .unwrap();
    assert_eq!(standing.state, VerificationState::Refused);
    assert_eq!(standing.subject_binding, "REFUSED_COMMIT_MISMATCH");

    assert_eq!(
        ReceiptDoctor::qualify_exact_subject(
            &json!({"repository_identity": REPOSITORY, "commit": BASE_SHA}),
            DiagnosticAudience::OperatorPrivate,
            REPOSITORY,
            &BASE_SHA.to_ascii_uppercase(),
        )
        .unwrap_err(),
        "immutable_base_sha_invalid"
    );
}
