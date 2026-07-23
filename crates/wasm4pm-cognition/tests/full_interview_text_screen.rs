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

fn domain_pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("canonical interview domain pack must deserialize")
}

fn fixture() -> InterviewFixture {
    serde_json::from_str(include_str!(
        "fixtures/full_hour_coordinate_interview.json"
    ))
    .expect("full-hour interview fixture must deserialize")
}

fn observation_id(event: &InterviewEvent, index: usize) -> String {
    let clock = event
        .timestamp
        .split('T')
        .nth(1)
        .unwrap_or("00:00:00")
        .split('-')
        .next()
        .unwrap_or("00:00:00")
        .replace(':', "");
    format!("fixture-{index:02}-{clock}")
}

fn apply_event(
    pack: &DomainPack,
    state: Option<SessionState>,
    event: &InterviewEvent,
    index: usize,
) -> SessionTurnOutput {
    let (observation, confirmation) = match event.kind.as_str() {
        "observation" => (
            Some(Observation {
                id: observation_id(event, index),
                source: event.speaker.clone(),
                text: event.text.clone(),
                retract_evidence_ids: vec![],
            }),
            None,
        ),
        "confirmation" => (
            None,
            Some(Confirmation {
                track_id: event
                    .track_id
                    .clone()
                    .expect("confirmation fixture requires track_id"),
                accepted: event
                    .accepted
                    .expect("confirmation fixture requires accepted"),
            }),
        ),
        other => panic!("unknown fixture event kind: {other}"),
    };

    run_session_turn(&SessionTurnInput {
        domain_pack: pack.clone(),
        previous_state: state,
        observation,
        confirmation,
    })
    .unwrap_or_else(|error| {
        panic!(
            "fixture turn {index} at {} ({}) was refused: {error}",
            event.timestamp, event.text
        )
    })
}

fn short_clock(timestamp: &str) -> &str {
    timestamp
        .split('T')
        .nth(1)
        .unwrap_or(timestamp)
        .split('-')
        .next()
        .unwrap_or(timestamp)
}

fn display_label<'a>(pack: &'a DomainPack, track_id: &str) -> &'a str {
    pack.tracks
        .iter()
        .find(|track| track.id == track_id)
        .map(|track| track.label.as_str())
        .unwrap_or(track_id)
}

fn concept_label(pack: &DomainPack, concept_id: &str) -> String {
    pack.concepts
        .get(concept_id)
        .map(|concept| concept.label.clone())
        .unwrap_or_else(|| concept_id.replace('_', " "))
}

fn render_text_screen(
    fixture: &InterviewFixture,
    pack: &DomainPack,
    event_index: usize,
    event: &InterviewEvent,
    output: &SessionTurnOutput,
) -> String {
    let state = &output.state;
    let projection = &output.projection;
    let current_track = projection
        .current_track
        .as_deref()
        .map(|id| display_label(pack, id).to_string())
        .unwrap_or_else(|| "Undetermined".to_string());
    let commitment = state
        .committed_track
        .as_deref()
        .map(|id| display_label(pack, id).to_string())
        .unwrap_or_else(|| "None".to_string());
    let pending = state
        .pending_confirmation
        .as_deref()
        .map(|id| display_label(pack, id).to_string())
        .unwrap_or_else(|| "None".to_string());

    let mut lines = vec![
        "┌──────────────────────────────────────────────────────────────────────────────┐".to_string(),
        "│ WASM4PM COGNITION · INTERVIEW TEXT SCREEN                                   │".to_string(),
        "├──────────────────────────────────────────────────────────────────────────────┤".to_string(),
        format!("│ Session  : {}", fixture.title),
        format!(
            "│ Clock    : {}  · elapsed {:02}m  · turn {:02}",
            short_clock(&event.timestamp),
            event.elapsed_minutes,
            state.turn
        ),
        format!("│ Phase    : {}", projection.phase_label),
        format!("│ Track    : {current_track}"),
        format!("│ Committed: {commitment}"),
        format!("│ Confirm  : {pending}"),
        "├──────────────────────────────────────────────────────────────────────────────┤".to_string(),
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
            if hypothesis.eliminated { "  REJECTED" } else { "" }
        ));
    }

    lines.push("├──────────────────────────────────────────────────────────────────────────────┤".to_string());
    lines.push("│ COVERED".to_string());
    if projection.covered_concepts.is_empty() {
        lines.push("│   · None".to_string());
    } else {
        for concept in &projection.covered_concepts {
            lines.push(format!("│   ✓ {}", concept_label(pack, concept)));
        }
    }

    lines.push("│ MISSING".to_string());
    if projection.missing_concepts.is_empty() {
        lines.push("│   · None".to_string());
    } else {
        for concept in &projection.missing_concepts {
            let spec = pack.concepts.get(concept);
            lines.push(format!("│   ○ {}", concept_label(pack, concept)));
            if let Some(spec) = spec {
                lines.push(format!("│     prompt: {}", spec.prompt));
            }
        }
    }

    lines.push("├──────────────────────────────────────────────────────────────────────────────┤".to_string());
    lines.push("│ RECENT TRANSCRIPT".to_string());
    let first = event_index.saturating_sub(3);
    for prior in &fixture.events[first..=event_index] {
        lines.push(format!(
            "│ [{} +{:02}m] {:<11} {}",
            short_clock(&prior.timestamp),
            prior.elapsed_minutes,
            prior.speaker,
            prior.text
        ));
    }

    lines.push("├──────────────────────────────────────────────────────────────────────────────┤".to_string());
    lines.push(format!(
        "│ Receipt  : {}  · state {}  · {}",
        &output.receipt.combined_hash[..16],
        &state.state_hash[..16],
        if projection.complete { "COMPLETE" } else { "ACTIVE" }
    ));
    lines.push("└──────────────────────────────────────────────────────────────────────────────┘".to_string());
    lines.join("\n")
}

fn assert_screen_contains(name: &str, screen: &str, expected: &[&str]) {
    for needle in expected {
        assert!(
            screen.contains(needle),
            "checkpoint {name:?} did not contain {needle:?}\n\n{screen}"
        );
    }
}

fn run_full_interview() -> (
    InterviewFixture,
    DomainPack,
    SessionState,
    BTreeMap<String, String>,
) {
    let fixture = fixture();
    let pack = domain_pack();
    let mut state = None;
    let mut screens = BTreeMap::new();

    for (index, event) in fixture.events.iter().enumerate() {
        let output = apply_event(&pack, state, event, index);
        if let Some(checkpoint) = &event.checkpoint {
            screens.insert(
                checkpoint.clone(),
                render_text_screen(&fixture, &pack, index, event, &output),
            );
        }
        state = Some(output.state);
    }

    (
        fixture,
        pack,
        state.expect("the interview must produce final state"),
        screens,
    )
}

#[test]
fn fixture_models_a_realistic_sixty_minute_interview() {
    let fixture = fixture();
    assert_eq!(fixture.started_at, "2026-07-23T09:00:00-07:00");
    assert_eq!(fixture.ended_at, "2026-07-23T10:00:00-07:00");
    assert_eq!(fixture.events.first().unwrap().elapsed_minutes, 0);
    assert_eq!(fixture.events.last().unwrap().elapsed_minutes, 60);
    assert!(fixture.events.len() >= 24, "hour simulation needs realistic conversational density");

    let mut previous = 0;
    for (index, event) in fixture.events.iter().enumerate() {
        assert!(event.elapsed_minutes >= previous, "event {index} moved backward in time");
        assert!(!event.text.trim().is_empty(), "event {index} has no realistic dialogue");
        assert!(matches!(event.speaker.as_str(), "candidate" | "interviewer"));
        previous = event.elapsed_minutes;
    }

    assert!(fixture.events.iter().any(|event| event.kind == "confirmation"));
    assert!(fixture.events.iter().any(|event| event.text.contains("complexity")));
    assert!(fixture.events.iter().any(|event| event.text.contains("edge cases")));
    assert!(fixture.events.iter().any(|event| event.text.contains("Follow-up")));
}

#[test]
fn full_hour_interview_commits_and_completes_coordinate_traversal() {
    let (fixture, pack, final_state, screens) = run_full_interview();

    assert_eq!(fixture.events.len() as u64, final_state.turn);
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
    assert!(screens.contains_key("opening"));
    assert!(screens.contains_key("approach-detected"));
    assert!(screens.contains_key("approach-confirmed"));
    assert!(screens.contains_key("implementation-midpoint"));
    assert!(screens.contains_key("solution-complete"));
    assert!(screens.contains_key("wrap-up"));

    verify_session_state(&pack, &final_state)
        .expect("the complete hour-long ledger must replay-verify");
}

#[test]
fn full_hour_text_screens_show_the_interview_evolving() {
    let (_fixture, _pack, _final_state, screens) = run_full_interview();

    assert_screen_contains(
        "opening",
        &screens["opening"],
        &[
            "Clock    : 09:00:00  · elapsed 00m  · turn 01",
            "Phase    : Track Identification",
            "Track    : Undetermined",
            "Committed: None",
            "[09:00:00 +00m] interviewer",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "clarification",
        &screens["clarification"],
        &[
            "Clock    : 09:07:00  · elapsed 07m  · turn 04",
            "Phase    : Track Identification",
            "Committed: None",
            "focus first on the normal path",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "approach-detected",
        &screens["approach-detected"],
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
            "dictionary of moves",
            "north south east west",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "approach-confirmed",
        &screens["approach-confirmed"],
        &[
            "Clock    : 09:15:00  · elapsed 15m  · turn 08",
            "Track    : Coordinate Traversal",
            "Committed: Coordinate Traversal",
            "Confirm  : None",
            "Phase    : Complexity",
            "Yes. Coordinate traversal is the intended primary track.",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "implementation-midpoint",
        &screens["implementation-midpoint"],
        &[
            "Clock    : 09:30:00  · elapsed 30m  · turn 14",
            "Committed: Coordinate Traversal",
            "Phase    : Complexity",
            "There is no recursion and no visited set.",
            "○ Complexity",
            "○ Edge cases",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "complexity",
        &screens["complexity"],
        &[
            "Clock    : 09:36:00  · elapsed 36m  · turn 16",
            "Phase    : Edge Cases",
            "✓ Complexity",
            "○ Edge cases",
            "one pass over n commands",
            "constant because the coordinate state",
            "ACTIVE",
        ],
    );

    assert_screen_contains(
        "solution-complete",
        &screens["solution-complete"],
        &[
            "Clock    : 09:47:00  · elapsed 47m  · turn 20",
            "Phase    : Complete",
            "Committed: Coordinate Traversal",
            "✓ Edge cases",
            "MISSING\n│   · None",
            "typed error for malformed commands",
            "COMPLETE",
        ],
    );

    assert_screen_contains(
        "follow-up",
        &screens["follow-up"],
        &[
            "Clock    : 09:57:00  · elapsed 57m  · turn 24",
            "Phase    : Complete",
            "sequence numbers or one serialized input channel",
            "reject gaps and duplicates",
            "COMPLETE",
        ],
    );

    assert_screen_contains(
        "wrap-up",
        &screens["wrap-up"],
        &[
            "Clock    : 10:00:00  · elapsed 60m  · turn 26",
            "Phase    : Complete",
            "Committed: Coordinate Traversal",
            "linear time, constant auxiliary space",
            "strict typed error policy",
            "COMPLETE",
        ],
    );
}

#[test]
fn replaying_the_same_hour_produces_identical_text_screens_and_state() {
    let (_, _, first_state, first_screens) = run_full_interview();
    let (_, _, second_state, second_screens) = run_full_interview();

    assert_eq!(first_state, second_state);
    assert_eq!(first_screens, second_screens);
    assert_eq!(first_state.state_hash, second_state.state_hash);
}
