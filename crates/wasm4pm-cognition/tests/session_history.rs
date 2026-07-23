use wasm4pm_cognition::session::{
    hash_session_state, run_session_turn, Confirmation, DomainPack, Observation, SessionError,
    SessionTurnInput,
};

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain pack")
}

fn coordinate_observation(id: &str) -> Observation {
    Observation {
        id: id.to_string(),
        source: "candidate".to_string(),
        text: "x and y dictionary of moves north south east west iterate".to_string(),
        retract_evidence_ids: vec![],
    }
}

#[test]
fn recomputed_hash_cannot_forge_confirmation_history() {
    let domain = pack();
    let mut first = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(coordinate_observation("o1")),
        confirmation: None,
    })
    .expect("first turn");

    first.state.committed_track = Some("graph_dfs".to_string());
    first.state.pending_confirmation = None;
    first.state.state_hash = hash_session_state(&first.state).expect("rehash forged state");

    let error = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: Some(first.state),
        observation: Some(Observation {
            id: "o2".to_string(),
            source: "candidate".to_string(),
            text: "linear time".to_string(),
            retract_evidence_ids: vec![],
        }),
        confirmation: None,
    })
    .expect_err("forged commitment must not survive ledger replay");

    assert!(matches!(error, SessionError::InvalidState { .. }));
}

#[test]
fn confirmation_only_turns_are_resource_bounded() {
    let mut domain = pack();
    domain.bounds.max_turns = 1;
    let first = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(coordinate_observation("o1")),
        confirmation: None,
    })
    .expect("first turn");

    let error = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: Some(first.state),
        observation: None,
        confirmation: Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: true,
        }),
    })
    .expect_err("second turn exceeds max_turns");

    assert_eq!(
        error,
        SessionError::ResourceCap {
            resource: "turns".to_string()
        }
    );
}
