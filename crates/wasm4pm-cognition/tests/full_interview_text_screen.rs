use serde::Deserialize;
use std::collections::BTreeMap;
use wasm4pm_cognition::session::{
    run_session_turn, verify_session_state, Confirmation, DomainPack, Observation, SessionState,
    SessionTurnInput, SessionTurnOutput,
};

#[derive(Debug, Deserialize)]
struct InterviewFixture {
    title: String,
    started_at: String,
    ended_at: String,
    events: Vec<InterviewEvent>,
}

#[derive(Debug, Clone, Deserialize)]
struct InterviewEvent {
    elapsed_minutes: u32,
    timestamp: String,
    speaker: String,
    kind: String,
    text: String,
    #[serde(default)]
    track_id: Option<String>,
    #[serde(default)]
    accepted: Option<bool>,
    #[serde(default)]
    checkpoint: Option<String>,
}

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("canonical interview domain pack")
}

fn fixture() -> InterviewFixture {
    serde_json::from_str(include_str!("fixtures/full_hour_coordinate_interview.json"))
        .expect("full-hour interview fixture")
}

fn clock(timestamp: &str) -> &str {
    timestamp
        .split('T')
        .nth(1)
        .unwrap_or(timestamp)
        .split('-')
        .next()
        .unwrap_or(timestamp)
}

fn label(pack: &DomainPack, track_id: &str) -> String {
    pack.tracks
        .iter()
        .find(|track| track.id == track_id)
        .map(|track| track.label.clone())
        .unwrap_or_else(|| track_id.to_string())
}

fn concept_label(pack: &DomainPack, concept_id: &str) -> String {
    pack.concepts
        .get(concept_id)
        .map(|concept| concept.label.clone())
        .unwrap_or_else(|| concept_id.replace('_', " "))
}

fn apply(
    pack: &DomainPack,
    state: Option<SessionState>,
    event: &InterviewEvent,
    index: usize,
) -> SessionTurnOutput {
    let (observation, confirmation) = match event.kind.as_str() {
        "observation" => (
            Some(Observation {
                id: format!(
                    "fixture-{index:02}-{}",
                    clock(&event.timestamp).replace(':', "")
                ),
                source: event.speaker.clone(),
                text: event.text.clone(),
                retract_evidence_ids: vec![],
            }),
            None,
        ),
        "confirmation" => (
            None,
            Some(Confirmation {
                track_id: event.track_id.clone().expect("confirmation track"),
                accepted: event.accepted.expect("confirmation decision"),
            }),
        ),
        other => panic!("unknown event kind: {other}"),
    };

    run_session_turn(&SessionTurnInput {
        domain_pack: pack.clone(),
        previous_state: state,
        observation,
        confirmation,
    })
    .unwrap_or_else(|error| {
        panic!(
            "turn {index} at {} ({}) was refused: {error}",
            event.timestamp, event.text
        )
    })
}

fn render_screen(
    fixture: &InterviewFixture,
    pack: &DomainPack,
    event_index: usize,
    event: &InterviewEvent,
    output: &SessionTurnOutput,
) -> String {
    let state = &output.state;
    let projection = &output.projection;
    let current = projection
        .current_track
        .as_deref()
        .map(|id| label(pack, id))
        .unwrap_or_else(|| "Undetermined".to_string());
    let committed = state
        .committed_track
        .as_deref()
        .map(|id| label(pack, id))
        .unwrap_or_else(|| "None".to_string());
    let pending = state
        .pending_confirmation
        .as_deref()
        .map(|id| label(pack, id))
        .unwrap_or_else(|| "None".to_string());

    let mut lines = vec![
        "┌──────────────────────────────────────────────────────────────────────────────┐"
            .to_string(),
        "│ WASM4PM COGNITION · INTERVIEW TEXT SCREEN                                   │"
            .to_string(),
        "├──────────────────────────────────────────────────────────────────────────────┤"
            .to_string(),
        format!("│ Session  : {}", fixture.title),
        format!(
            "│ Clock    : {}  · elapsed {:02}m  · turn {:02}",
            clock(&event.timestamp),
            event.elapsed_minutes,
            state.turn
        ),
        format!("│ Phase    : {}", projection.phase_label),
        format!("│ Track    : {current}"),
        format!("│ Committed: {committed}"),
        format!("│ Confirm  : {pending}"),
        "├──────────────────────────────────────────────────────────────────────────────┤"
            .to_string(),
        "│ RANKED HYPOTHESES".to_string(),
    ];

    for (rank, hypothesis) in projection.hypotheses.iter().enumerate() {
        lines.push(format!(
            "│ {:>2}. {:<24} score {:>3}%  support {:>3}%  contradiction {:>3}%{}",
            rank + 1,
            hypothesis.label,
            (hypothesis.score * 100.0).round() as u32,
            (hypothesis.support * 100.0).round() as u32,
            (hypothesis.contradiction * 100.0).round() as u32,
            if hypothesis.eliminated {
                "  REJECTED"
            } else {
                ""
            }
        ));
    }

    lines.push(
        "├──────────────────────────────────────────────────────────────────────────────┤"
            .to_string(),
    );
    lines.push("│ COVERED".to_string());
    if projection.covered_concepts.is_empty() {
        lines.push("│   · None".to_string());
    } else {
        lines.extend(
            projection
                .covered_concepts
                .iter()
                .map(|id| format!("│   ✓ {}", concept_label(pack, id))),
        );
    }

    lines.push("│ MISSING".to_string());
    if projection.missing_concepts.is_empty() {
        lines.push("│   · None".to_string());
    } else {
        for id in &projection.missing_concepts {
            lines.push(format!("│   ○ {}", concept_label(pack, id)));
            if let Some(spec) = pack.concepts.get(id) {
                lines.push(format!("│     prompt: {}", spec.prompt));
            }
        }
    }

    lines.push(
        "├──────────────────────────────────────────────────────────────────────────────┤"
            .to_string(),
    );
    lines.push("│ RECENT TRANSCRIPT".to_string());
    let first = event_index.saturating_sub(3);
    for prior in &fixture.events[first..=event_index] {
        lines.push(format!(
            "│ [{} +{:02}m] {:<11} {}",
            clock(&prior.timestamp),
            prior.elapsed_minutes,
            prior.speaker,
            prior.text
        ));
    }

    lines.push(
        "├──────────────────────────────────────────────────────────────────────────────┤"
            .to_string(),
    );
    lines.push(format!(
        "│ Receipt  : {}  · state {}  · {}",
        &output.receipt.combined_hash[..16],
        &state.state_hash[..16],
        if projection.complete {
            "COMPLETE"
        } else {
            "ACTIVE"
        }
    ));
    lines.push(
        "└──────────────────────────────────────────────────────────────────────────────┘"
            .to_string(),
    );
    lines.join("\n")
}

fn run_interview() -> (
    InterviewFixture,
    DomainPack,
    SessionState,
    BTreeMap<String, String>,
) {
    let fixture = fixture();
    let pack = pack();
    let mut state = None;
    let mut screens = BTreeMap::new();

    for (index, event) in fixture.events.iter().enumerate() {
        let output = apply(&pack, state, event, index);
        if let Some(checkpoint) = &event.checkpoint {
            screens.insert(
                checkpoint.clone(),
                render_screen(&fixture, &pack, index, event, &output),
            );
        }
        state = Some(output.state);
    }

    (fixture, pack, state.expect("final state"), screens)
}

fn assert_contains(screen_name: &str, screen: &str, expected: &[&str]) {
    for text in expected {
        assert!(
            screen.contains(text),
            "screen {screen_name:?} missing {text:?}\n\n{screen}"
        );
    }
}

#[test]
fn fixture_spans_a_realistic_hour() {
    let fixture = fixture();
    assert_eq!(fixture.started_at, "2026-07-23T09:00:00-07:00");
    assert_eq!(fixture.ended_at, "2026-07-23T10:00:00-07:00");
    assert_eq!(fixture.events.first().unwrap().elapsed_minutes, 0);
    assert_eq!(fixture.events.last().unwrap().elapsed_minutes, 60);
    assert!(fixture.events.len() >= 24);

    let mut prior = 0;
    for event in &fixture.events {
        assert!(event.elapsed_minutes >= prior);
        assert!(!event.text.trim().is_empty());
        assert!(matches!(
            event.speaker.as_str(),
            "candidate" | "interviewer"
        ));
        prior = event.elapsed_minutes;
    }

    assert!(fixture
        .events
        .iter()
        .any(|event| event.kind == "confirmation"));
    assert!(fixture
        .events
        .iter()
        .any(|event| event.text.contains("complexity")));
    assert!(fixture
        .events
        .iter()
        .any(|event| event.text.contains("edge cases")));
    assert!(fixture
        .events
        .iter()
        .any(|event| event.text.contains("Follow-up")));
}

#[test]
fn full_hour_commits_and_completes_coordinate_traversal() {
    let (fixture, pack, final_state, screens) = run_interview();
    assert_eq!(final_state.turn, fixture.events.len() as u64);
    assert_eq!(
        final_state.committed_track.as_deref(),
        Some("coordinate_traversal")
    );
    assert_eq!(final_state.phase, "complete");
    assert!(final_state.pending_confirmation.is_none());
    assert!(final_state.missing_concepts.is_empty());
    assert_eq!(
        final_state.covered_concepts,
        vec![
            "complexity",
            "data_structure",
            "edge_cases",
            "state_representation",
            "termination",
            "transition_function",
        ]
    );
    for required in [
        "opening",
        "clarification",
        "approach-detected",
        "approach-confirmed",
        "implementation-midpoint",
        "complexity",
        "solution-complete",
        "follow-up",
        "wrap-up",
    ] {
        assert!(
            screens.contains_key(required),
            "missing checkpoint {required}"
        );
    }
    verify_session_state(&pack, &final_state).expect("full ledger must replay-verify");
}

#[test]
fn text_screens_show_the_hour_evolving() {
    let (_, _, _, screens) = run_interview();

    let expectations: [(&str, &[&str]); 9] = [
        (
            "opening",
            &[
                "Clock    : 09:00:00  · elapsed 00m  · turn 01",
                "Phase    : Track Identification",
                "Track    : Undetermined",
                "Committed: None",
                "ACTIVE",
            ],
        ),
        (
            "clarification",
            &[
                "Clock    : 09:07:00  · elapsed 07m  · turn 04",
                "Phase    : Track Identification",
                "focus first on the normal path",
                "ACTIVE",
            ],
        ),
        (
            "approach-detected",
            &[
                "Clock    : 09:13:00  · elapsed 13m  · turn 07",
                "Track    : Coordinate Traversal",
                "Committed: None",
                "Confirm  : Coordinate Traversal",
                "✓ State representation",
                "✓ Transition logic",
                "✓ Data structure",
                "✓ Termination",
                "○ Complexity",
                "○ Edge cases",
                "north south east west",
            ],
        ),
        (
            "approach-confirmed",
            &[
                "Clock    : 09:15:00  · elapsed 15m  · turn 08",
                "Committed: Coordinate Traversal",
                "Confirm  : None",
                "Phase    : Complexity",
                "intended primary track",
                "ACTIVE",
            ],
        ),
        (
            "implementation-midpoint",
            &[
                "Clock    : 09:30:00  · elapsed 30m  · turn 14",
                "Committed: Coordinate Traversal",
                "Phase    : Complexity",
                "There is no recursion and no visited set.",
                "○ Complexity",
                "○ Edge cases",
            ],
        ),
        (
            "complexity",
            &[
                "Clock    : 09:36:00  · elapsed 36m  · turn 16",
                "Phase    : Edge Cases",
                "✓ Complexity",
                "○ Edge cases",
                "one pass over n commands",
            ],
        ),
        (
            "solution-complete",
            &[
                "Clock    : 09:47:00  · elapsed 47m  · turn 20",
                "Phase    : Complete",
                "Committed: Coordinate Traversal",
                "✓ Edge cases",
                "MISSING\n│   · None",
                "typed error for malformed commands",
                "COMPLETE",
            ],
        ),
        (
            "follow-up",
            &[
                "Clock    : 09:57:00  · elapsed 57m  · turn 24",
                "Phase    : Complete",
                "sequence numbers or one serialized input channel",
                "reject gaps and duplicates",
                "COMPLETE",
            ],
        ),
        (
            "wrap-up",
            &[
                "Clock    : 10:00:00  · elapsed 60m  · turn 26",
                "Phase    : Complete",
                "Committed: Coordinate Traversal",
                "linear time, constant auxiliary space",
                "strict typed error policy",
                "COMPLETE",
            ],
        ),
    ];

    for (name, expected) in expectations {
        assert_contains(name, &screens[name], expected);
    }
}

#[test]
fn replaying_the_hour_is_bit_deterministic() {
    let (_, _, first_state, first_screens) = run_interview();
    let (_, _, second_state, second_screens) = run_interview();
    assert_eq!(first_state, second_state);
    assert_eq!(first_screens, second_screens);
    assert_eq!(first_state.state_hash, second_state.state_hash);
}
