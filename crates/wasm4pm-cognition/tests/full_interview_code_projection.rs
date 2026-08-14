use serde::Deserialize;
use wasm4pm_cognition::session::{
    project_python_code, run_session_turn, Confirmation, DomainPack, Observation, SessionState,
    SessionTurnInput,
};

#[derive(Deserialize)]
struct Fixture {
    events: Vec<Event>,
}

#[derive(Deserialize)]
struct Event {
    speaker: String,
    kind: String,
    text: String,
    #[serde(default)]
    track_id: Option<String>,
    #[serde(default)]
    accepted: Option<bool>,
}

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain")
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!("fixtures/full_hour_coordinate_interview.json"))
        .expect("valid full-hour fixture")
}

#[test]
fn full_hour_state_selects_committed_coordinate_python() {
    let domain = pack();
    let fixture = fixture();
    let mut state: Option<SessionState> = None;

    for (index, event) in fixture.events.iter().enumerate() {
        let (observation, confirmation) = match event.kind.as_str() {
            "observation" => (
                Some(Observation {
                    id: format!("full-hour-code-{index:02}"),
                    source: event.speaker.clone(),
                    text: event.text.clone(),
                    retract_evidence_ids: vec![],
                }),
                None,
            ),
            "confirmation" => (
                None,
                Some(Confirmation {
                    track_id: event.track_id.clone().expect("confirmation has track"),
                    accepted: event.accepted.expect("confirmation has decision"),
                }),
            ),
            other => panic!("unsupported fixture event kind: {other}"),
        };

        state = Some(
            run_session_turn(&SessionTurnInput {
                domain_pack: domain.clone(),
                previous_state: state,
                observation,
                confirmation,
            })
            .unwrap_or_else(|error| panic!("full-hour turn {index} refused: {error}"))
            .state,
        );
    }

    let state = state.expect("full hour produces state");
    assert_eq!(state.phase, "complete");
    assert_eq!(
        state.committed_track.as_deref(),
        Some("coordinate_traversal")
    );

    let projected = project_python_code(&domain, &state)
        .expect("full-hour state replay-verifies")
        .expect("committed track has Python source");
    assert_eq!(projected.selection_status, "committed");
    assert_eq!(projected.filename, "coordinate_traversal.py");
    assert!(projected.source.contains("def final_position"));
    assert!(projected.source.contains("raise ValueError"));
    assert_eq!(projected.source_hash.len(), 64);
}
