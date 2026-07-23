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

#[test]
fn converges_and_requires_confirmation() {
    let output = run_session_turn(&turn(
        None,
        Some((
            "o1",
            "I would use x and y with a dictionary of moves north south east west and iterate",
        )),
        None,
    ))
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
    assert!(hash_session_state(&output.state).is_ok_and(|h| h == output.state.state_hash));
}

#[test]
fn confirmation_commits_track() {
    let first = run_session_turn(&turn(
        None,
        Some((
            "o1",
            "x and y dictionary of moves north south east west iterate",
        )),
        None,
    ))
    .expect("first turn");
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
        .find(|h| h.id == "grid_dfs")
        .expect("grid hypothesis");
    let coordinate = second
        .projection
        .hypotheses
        .iter()
        .find(|h| h.id == "coordinate_traversal")
        .expect("coordinate hypothesis");
    assert!(coordinate.score > grid.score);
    assert!(grid.contradiction > 0.0);
}

#[test]
fn explicit_rejection_eliminates_track() {
    let first = run_session_turn(&turn(
        None,
        Some((
            "o1",
            "x and y dictionary of moves north south east west iterate",
        )),
        None,
    ))
    .expect("first turn");
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
        .find(|h| h.id == "coordinate_traversal")
        .expect("rejected hypothesis");
    assert!(rejected.eliminated);
    assert_eq!(rejected.score, 0.0);
}

#[test]
fn refuses_tampered_state() {
    let mut first = run_session_turn(&turn(None, Some(("o1", "x and y")), None))
        .expect("first turn");
    first.state.turn = 99;
    let err = run_session_turn(&turn(
        Some(first.state),
        Some(("o2", "dictionary of moves")),
        None,
    ))
    .expect_err("tamper must refuse");
    assert_eq!(err, SessionError::StateHashMismatch);
}

#[test]
fn identical_inputs_replay_bit_exactly() {
    let input = turn(None, Some(("o1", "x and y dictionary of moves")), None);
    let a = run_session_turn(&input).expect("first replay");
    let b = run_session_turn(&input).expect("second replay");
    assert_eq!(a, b);
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
