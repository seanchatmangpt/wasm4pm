use wasm4pm_cognition::session::{
    project_python_code, run_session_turn, Confirmation, DomainPack, Observation, SessionTurnInput,
};

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain")
}

fn coordinate_observation() -> Observation {
    Observation {
        id: "code-projection-observation".to_string(),
        source: "candidate".to_string(),
        text: "I would keep x and y, use a dictionary of moves for north south east west, and iterate through every instruction once."
            .to_string(),
        retract_evidence_ids: vec![],
    }
}

#[test]
fn leading_hypothesis_selects_canonical_python_without_ui_mapping() {
    let domain = pack();
    let turn = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(coordinate_observation()),
        confirmation: None,
    })
    .expect("coordinate evidence should be admitted");

    let code = project_python_code(&domain, &turn.state)
        .expect("state should replay-verify")
        .expect("coordinate track has canonical Python");

    assert_eq!(code.track_id, "coordinate_traversal");
    assert_eq!(code.selection_status, "leading_hypothesis");
    assert_eq!(code.language, "python");
    assert_eq!(code.filename, "coordinate_traversal.py");
    assert!(code.source.contains("def final_position"));
    assert!(code.source.contains("MOVE_DELTAS"));
    assert_eq!(code.source_hash.len(), 64);
}

#[test]
fn confirmation_changes_projection_status_but_not_source_identity() {
    let domain = pack();
    let first = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(coordinate_observation()),
        confirmation: None,
    })
    .expect("coordinate evidence should be admitted");
    let before = project_python_code(&domain, &first.state)
        .expect("valid state")
        .expect("leading code");

    let confirmed = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: Some(first.state),
        observation: None,
        confirmation: Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: true,
        }),
    })
    .expect("eligible track should confirm");
    let after = project_python_code(&domain, &confirmed.state)
        .expect("valid confirmed state")
        .expect("committed code");

    assert_eq!(after.selection_status, "committed");
    assert_eq!(after.source_hash, before.source_hash);
    assert_eq!(after.source, before.source);
}

#[test]
fn code_projection_refuses_derived_state_forgery() {
    let domain = pack();
    let mut turn = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(coordinate_observation()),
        confirmation: None,
    })
    .expect("coordinate evidence should be admitted");

    turn.state.committed_track = Some("graph_dfs".to_string());
    let error = project_python_code(&domain, &turn.state)
        .expect_err("projection must verify state before selecting code");
    assert!(error.to_string().contains("hash mismatch") || error.to_string().contains("invalid"));
}
