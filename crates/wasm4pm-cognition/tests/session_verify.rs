use wasm4pm_cognition::session::{
    hash_session_state, run_session_turn, verify_session_state, DomainPack, Observation,
    SessionError, SessionTurnInput,
};

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain")
}

#[test]
fn verifier_accepts_exact_ledger_replay() {
    let domain = pack();
    let output = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(Observation {
            id: "verify-1".to_string(),
            source: "candidate".to_string(),
            text: "x and y dictionary of moves".to_string(),
            retract_evidence_ids: vec![],
        }),
        confirmation: None,
    })
    .expect("turn succeeds");

    verify_session_state(&domain, &output.state).expect("state replay verifies");
}

#[test]
fn verifier_rejects_rehashed_derived_state_forgery() {
    let domain = pack();
    let mut output = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(Observation {
            id: "verify-1".to_string(),
            source: "candidate".to_string(),
            text: "x and y dictionary of moves".to_string(),
            retract_evidence_ids: vec![],
        }),
        confirmation: None,
    })
    .expect("turn succeeds");

    output.state.phase = "complete".to_string();
    output.state.state_hash = hash_session_state(&output.state).expect("public rehash succeeds");
    let error = verify_session_state(&domain, &output.state)
        .expect_err("ledger replay must reject forged derived state");
    assert!(matches!(error, SessionError::InvalidState { .. }));
}
