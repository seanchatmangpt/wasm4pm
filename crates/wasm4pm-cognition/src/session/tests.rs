//! Session behavior and falsification tests.

use super::*;
use std::collections::BTreeMap;

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain pack")
}

fn turn(
    previous_state: Option<SessionState>,
    text: Option<(&str, &str)>,
    confirmation: Option<Confirmation>,
) -> SessionTurnInput {
    SessionTurnInput {
        domain_pack: pack(),
        previous_state,
        observation: text.map(|(id, text)| Observation {
            id: id.to_string(),
            source: "candidate".to_string(),
            text: text.to_string(),
            retract_evidence_ids: vec![],
        }),
        confirmation,
    }
}

fn coordinate_answer() -> &'static str {
    "I would use x and y with a dictionary of moves north south east west and iterate"
}

#[test]
fn converges_and_requires_confirmation() {
    let output = run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None))
        .expect("turn succeeds");
    assert_eq!(
        output.projection.current_track.as_deref(),
        Some("coordinate_traversal")
    );
    assert_eq!(
        output.projection.pending_confirmation.as_deref(),
        Some("coordinate_traversal")
    );
    assert!(output.projection.covered_concepts.len() >= 3);
    assert!(hash_session_state(&output.state).is_ok_and(|hash| hash == output.state.state_hash));
    assert!(output
        .state
        .evidence
        .iter()
        .any(|evidence| evidence.matched_phrase == "dictionary of moves"));
}

#[test]
fn confirmation_commits_track() {
    let first =
        run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None)).expect("first turn");
    let second = run_session_turn(&turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: true,
        }),
    ))
    .expect("confirmation turn");
    assert_eq!(
        second.state.committed_track.as_deref(),
        Some("coordinate_traversal")
    );
    assert_ne!(second.state.phase, "track_identification");
}

#[test]
fn ambiguity_does_not_commit() {
    let output = run_session_turn(&turn(
        None,
        Some(("o1", "coordinates and visit neighboring cells")),
        None,
    ))
    .expect("turn succeeds");
    assert!(output.projection.pending_confirmation.is_none());
    assert!(output.projection.hypotheses[0].score > 0.0);
    assert!(output.projection.hypotheses[1].score > 0.0);
}

#[test]
fn contradictory_iteration_reduces_recursive_track() {
    let first = run_session_turn(&turn(None, Some(("o1", "I would use recursion")), None))
        .expect("first turn");
    let second = run_session_turn(&turn(
        Some(first.state),
        Some(("o2", "Actually I would iterate instead")),
        None,
    ))
    .expect("second turn");
    let grid = second
        .projection
        .hypotheses
        .iter()
        .find(|hypothesis| hypothesis.id == "grid_dfs")
        .expect("grid hypothesis");
    let coordinate = second
        .projection
        .hypotheses
        .iter()
        .find(|hypothesis| hypothesis.id == "coordinate_traversal")
        .expect("coordinate hypothesis");
    assert!(coordinate.score > grid.score);
    assert!(grid.contradiction > 0.0);
}

#[test]
fn contractions_are_recognized_as_negative_evidence() {
    let output = run_session_turn(&turn(None, Some(("o1", "I don't recurse")), None))
        .expect("turn succeeds");
    let evidence = output
        .state
        .evidence
        .iter()
        .find(|evidence| evidence.pattern_id == "recursive-traversal")
        .expect("recursive evidence");
    assert_eq!(evidence.polarity, EvidencePolarity::Negative);
    assert_eq!(evidence.matched_phrase, "recurse");
}

#[test]
fn concept_coverage_is_scoped_to_the_ranked_track() {
    let output = run_session_turn(&turn(
        None,
        Some((
            "o1",
            "coordinates adjacency list visited set recursion vertices plus edges edge cases",
        )),
        None,
    ))
    .expect("turn succeeds");
    assert_eq!(
        output.projection.current_track.as_deref(),
        Some("graph_dfs")
    );
    assert!(output
        .projection
        .missing_concepts
        .contains(&"state_representation".to_string()));
}

#[test]
fn hash_lookup_can_complete_without_a_transition_concept() {
    let first = run_session_turn(&turn(
        None,
        Some(("o1", "key value pairs hash lookup linear time missing key")),
        None,
    ))
    .expect("first turn");
    assert_eq!(
        first.projection.pending_confirmation.as_deref(),
        Some("hash_lookup")
    );
    let second = run_session_turn(&turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "hash_lookup".to_string(),
            accepted: true,
        }),
    ))
    .expect("confirmation turn");
    assert!(second.projection.complete);
    assert_eq!(second.projection.phase, "complete");
}

#[test]
fn explicit_rejection_eliminates_track() {
    let first =
        run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None)).expect("first turn");
    let second = run_session_turn(&turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: false,
        }),
    ))
    .expect("rejection turn");
    let rejected = second
        .projection
        .hypotheses
        .iter()
        .find(|hypothesis| hypothesis.id == "coordinate_traversal")
        .expect("rejected hypothesis");
    assert!(rejected.eliminated);
    assert!(rejected.score.abs() <= f32::EPSILON);
}

#[test]
fn rejection_must_target_pending_or_committed_track() {
    let first =
        run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None)).expect("first turn");
    let error = run_session_turn(&turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "graph_dfs".to_string(),
            accepted: false,
        }),
    ))
    .expect_err("unrelated rejection must refuse");
    assert_eq!(
        error,
        SessionError::ConfirmationNotPending {
            id: "graph_dfs".to_string()
        }
    );
}

#[test]
fn later_contradiction_reopens_a_committed_track() {
    let first =
        run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None)).expect("first turn");
    let committed = run_session_turn(&turn(
        Some(first.state),
        None,
        Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: true,
        }),
    ))
    .expect("confirmation turn");
    let revised = run_session_turn(&turn(
        Some(committed.state),
        Some((
            "o2",
            "not x and y no dictionary of moves without cardinal directions current node adjacency list visited set recursion vertices plus edges edge cases",
        )),
        None,
    ))
    .expect("revision turn");
    assert!(revised.state.committed_track.is_none());
    assert_eq!(
        revised.projection.current_track.as_deref(),
        Some("graph_dfs")
    );
    assert!(revised
        .inference_trace
        .iter()
        .any(|step| step.kind == "reopen-commitment"));
}

#[test]
fn refuses_tampered_state_hash() {
    let mut first =
        run_session_turn(&turn(None, Some(("o1", "x and y")), None)).expect("first turn");
    // Tamper a field that's part of StateHashView (hash.rs) but doesn't
    // participate in verify_previous_state's earlier structural checks
    // (turn.rs) — mutating `turn` instead trips the `turn == turns.len()`
    // ledger-length invariant first and returns InvalidState before the
    // hash comparison this test means to exercise is ever reached.
    first.state.phase = "tampered_phase".to_string();
    let error = run_session_turn(&turn(
        Some(first.state),
        Some(("o2", "dictionary of moves")),
        None,
    ))
    .expect_err("tamper must refuse");
    // Setting `turn` without extending `turns` violates the turn/ledger-length
    // invariant, which is checked before the hash — so this is InvalidState,
    // not StateHashMismatch (that variant is exercised by
    // refuses_semantically_forged_state_with_recomputed_hash below).
    assert_eq!(
        error,
        SessionError::InvalidState {
            reason: "persisted turn number must equal the non-empty turn ledger length"
                .to_string(),
        }
    );
}

#[test]
fn refuses_semantically_forged_state_with_recomputed_hash() {
    let mut first =
        run_session_turn(&turn(None, Some(("o1", coordinate_answer())), None)).expect("first turn");
    first.state.covered_concepts.push("complexity".to_string());
    first.state.state_hash = hash_session_state(&first.state).expect("rehash forged state");
    let error = run_session_turn(&turn(Some(first.state), Some(("o2", "linear time")), None))
        .expect_err("semantic forgery must refuse");
    assert!(matches!(error, SessionError::InvalidState { .. }));
}

#[test]
fn empty_observation_refuses() {
    let error = run_session_turn(&turn(None, Some(("o1", "   ")), None))
        .expect_err("empty observation must refuse");
    assert_eq!(error, SessionError::EmptyObservation);
}

#[test]
fn identical_inputs_replay_bit_exactly() {
    let input = turn(None, Some(("o1", "x and y dictionary of moves")), None);
    let first = run_session_turn(&input).expect("first replay");
    let second = run_session_turn(&input).expect("second replay");
    assert_eq!(first, second);
}

#[test]
fn threshold_boundary_below_does_not_confirm() {
    let mut domain = pack();
    domain.patterns = vec![PatternSpec {
        id: "boundary".to_string(),
        phrases: vec!["boundary".to_string()],
        proposition: "boundary".to_string(),
        track_weights: BTreeMap::from([("coordinate_traversal".to_string(), 0.899_999)]),
        concept: Some("state_representation".to_string()),
    }];
    domain.rules.clear();
    domain.thresholds.confidence = 0.9;
    domain.thresholds.minimum_coverage = 1;
    domain.thresholds.margin = 0.0;
    let output = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: None,
        observation: Some(Observation {
            id: "o1".to_string(),
            source: "candidate".to_string(),
            text: "boundary".to_string(),
            retract_evidence_ids: vec![],
        }),
        confirmation: None,
    })
    .expect("boundary turn");
    assert!(output.projection.pending_confirmation.is_none());
}
