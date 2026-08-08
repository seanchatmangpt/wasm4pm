use std::collections::{BTreeMap, BTreeSet};

use proptest::prelude::*;
use wasm4pm_testing::{
    receipt_to_ocel_event, DifferentialOracle, ExpectedProcess, LifecycleOracle, ObjectRef,
    Operation, ProcessDisposition, ProcessEvidenceBundle, ProcessOracle, ProcessStep, Receipt,
    REFUSED_DISCOVER_IN_EPISODE, REFUSED_INVALID_RECEIPT_CHAIN,
    REFUSED_PROCESS_SEMANTIC_DIVERGENCE,
};

fn receipt(
    episode: &str,
    ordinal: u64,
    operation: Operation,
    predecessor_digest: Option<String>,
) -> Receipt {
    Receipt {
        episode_id: episode.to_owned(),
        ordinal,
        operation,
        subject_digest: "subject-blake3".to_owned(),
        predecessor_digest,
        consequence_observed: operation == Operation::Act,
        verification_passed: (operation == Operation::Verify).then_some(true),
        objects: vec![
            ObjectRef {
                object_type: "Episode".to_owned(),
                object_id: episode.to_owned(),
                qualifier: "episode".to_owned(),
            },
            ObjectRef {
                object_type: "Capability".to_owned(),
                object_id: "urn:example:capability".to_owned(),
                qualifier: "used-capability".to_owned(),
            },
        ],
    }
}

#[test]
fn gall_oracle_accepts_materialize_observe_act_verify_teardown() {
    let mut oracle = LifecycleOracle::default();
    let mut predecessor = None;
    let operations = [
        Operation::Materialize,
        Operation::Observe,
        Operation::Act,
        Operation::Observe,
        Operation::Verify,
        Operation::Teardown,
    ];

    for (ordinal, operation) in operations.into_iter().enumerate() {
        let current = receipt("episode-1", ordinal as u64, operation, predecessor);
        let disposition = oracle.observe(&current);
        if operation == Operation::Teardown {
            assert_eq!(disposition, ProcessDisposition::Terminal);
        } else {
            assert_eq!(disposition, ProcessDisposition::Conforming);
        }
        predecessor = Some(current.digest());
    }
}

#[test]
fn process_evidence_never_grants_authority() {
    for disposition in [
        ProcessDisposition::Conforming,
        ProcessDisposition::Terminal,
        ProcessDisposition::Dead {
            reason: "deviation".to_owned(),
        },
        ProcessDisposition::Blocked {
            reason: "runtime unavailable".to_owned(),
        },
        ProcessDisposition::Refused {
            code: "REFUSED:EXAMPLE".to_owned(),
        },
    ] {
        assert!(!disposition.grants_authority());
    }
}

#[test]
fn discover_is_registry_inspection_not_episode_trajectory() {
    let mut oracle = LifecycleOracle::default();
    let result = oracle.observe(&receipt("episode-1", 0, Operation::Discover, None));
    assert_eq!(
        result,
        ProcessDisposition::Refused {
            code: REFUSED_DISCOVER_IN_EPISODE.to_owned()
        }
    );
}

#[test]
fn receipt_chain_drift_is_refused_before_process_promotion() {
    let mut oracle = LifecycleOracle::default();
    let first = receipt("episode-1", 0, Operation::Materialize, None);
    assert_eq!(oracle.observe(&first), ProcessDisposition::Conforming);

    let drifted = receipt(
        "episode-1",
        1,
        Operation::Observe,
        Some("wrong-predecessor".to_owned()),
    );
    assert_eq!(
        oracle.observe(&drifted),
        ProcessDisposition::Refused {
            code: REFUSED_INVALID_RECEIPT_CHAIN.to_owned()
        }
    );
}

struct AlwaysTerminal;

impl ProcessOracle for AlwaysTerminal {
    fn observe(&mut self, _receipt: &Receipt) -> ProcessDisposition {
        ProcessDisposition::Terminal
    }
}

#[test]
fn differential_oracle_refuses_semantic_divergence() {
    let mut court = DifferentialOracle {
        left: LifecycleOracle::default(),
        right: AlwaysTerminal,
    };
    let result = court.observe(&receipt("episode-1", 0, Operation::Materialize, None));
    assert_eq!(
        result,
        ProcessDisposition::Refused {
            code: REFUSED_PROCESS_SEMANTIC_DIVERGENCE.to_owned()
        }
    );
}

#[test]
fn ocel_projection_preserves_multiple_typed_qualified_objects() {
    let source = receipt("episode-1", 0, Operation::Materialize, None);
    let event = receipt_to_ocel_event(&source);
    assert_eq!(event.activity, Operation::Materialize);
    assert_eq!(event.objects.len(), 2);
    assert!(event.objects.iter().any(|object| {
        object.object_type == "Episode" && object.qualifier == "episode"
    }));
    assert!(event.objects.iter().any(|object| {
        object.object_type == "Capability" && object.qualifier == "used-capability"
    }));
}

fn expected_parallel_process() -> ExpectedProcess {
    let steps = [
        ("materialize", Operation::Materialize),
        ("observe-a", Operation::Observe),
        ("observe-b", Operation::Observe),
        ("verify", Operation::Verify),
        ("teardown", Operation::Teardown),
    ]
    .into_iter()
    .map(|(step_id, operation)| {
        (
            step_id.to_owned(),
            ProcessStep {
                step_id: step_id.to_owned(),
                operation,
            },
        )
    })
    .collect::<BTreeMap<_, _>>();

    let precedes = [
        ("materialize", "observe-a"),
        ("materialize", "observe-b"),
        ("observe-a", "verify"),
        ("observe-b", "verify"),
        ("verify", "teardown"),
    ]
    .into_iter()
    .map(|(before, after)| (before.to_owned(), after.to_owned()))
    .collect::<BTreeSet<_>>();

    ExpectedProcess { steps, precedes }
}

#[test]
fn partial_order_accepts_both_lawful_linearizations() {
    let process = expected_parallel_process();
    for observed in [
        vec!["materialize", "observe-a", "observe-b", "verify", "teardown"],
        vec!["materialize", "observe-b", "observe-a", "verify", "teardown"],
    ] {
        let observed = observed.into_iter().map(str::to_owned).collect::<Vec<_>>();
        assert_eq!(process.check_observed(&observed), ProcessDisposition::Conforming);
    }
}

#[test]
fn partial_order_refuses_precedence_violation() {
    let process = expected_parallel_process();
    let observed = ["observe-a", "materialize", "observe-b", "verify", "teardown"]
        .into_iter()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    assert!(matches!(
        process.check_observed(&observed),
        ProcessDisposition::Dead { .. }
    ));
}

#[test]
fn repeated_operation_labels_keep_distinct_step_identity() {
    let mut process = expected_parallel_process();
    assert_eq!(process.steps["observe-a"].operation, Operation::Observe);
    assert_eq!(process.steps["observe-b"].operation, Operation::Observe);
    process.precedes.insert(("observe-a".to_owned(), "observe-b".to_owned()));

    let reversed = ["materialize", "observe-b", "observe-a", "verify", "teardown"]
        .into_iter()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    assert!(matches!(
        process.check_observed(&reversed),
        ProcessDisposition::Dead { .. }
    ));
}

#[test]
fn process_evidence_bundle_identity_binds_engine_model_and_replay() {
    let baseline = ProcessEvidenceBundle {
        subject_digest: "subject".to_owned(),
        engine_digest: "engine-a".to_owned(),
        model_digest: "model-a".to_owned(),
        dispositions: vec![ProcessDisposition::Conforming],
        replay_digest: "replay-a".to_owned(),
    };
    let mut changed = baseline.clone();
    changed.engine_digest = "engine-b".to_owned();
    assert_ne!(baseline.digest(), changed.digest());

    changed = baseline.clone();
    changed.model_digest = "model-b".to_owned();
    assert_ne!(baseline.digest(), changed.digest());

    changed = baseline.clone();
    changed.replay_digest = "replay-b".to_owned();
    assert_ne!(baseline.digest(), changed.digest());
}

proptest! {
    #[test]
    fn any_wrong_predecessor_is_refused(wrong in "[a-z0-9]{1,32}") {
        let mut oracle = LifecycleOracle::default();
        let first = receipt("episode-1", 0, Operation::Materialize, None);
        prop_assert_eq!(oracle.observe(&first), ProcessDisposition::Conforming);
        prop_assume!(wrong != first.digest());

        let next = receipt("episode-1", 1, Operation::Observe, Some(wrong));
        prop_assert_eq!(
            oracle.observe(&next),
            ProcessDisposition::Refused {
                code: REFUSED_INVALID_RECEIPT_CHAIN.to_owned()
            }
        );
    }
}
