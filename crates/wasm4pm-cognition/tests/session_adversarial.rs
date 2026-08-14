use std::collections::BTreeMap;

use wasm4pm_cognition::session::{
    run_session_turn, validate_domain_pack, Confirmation, DomainPack, Observation, PatternSpec,
    SessionError, SessionRule, SessionTurnInput,
};

fn pack() -> DomainPack {
    serde_json::from_str(include_str!(
        "../examples/cognition/interview_session/domain.json"
    ))
    .expect("valid interview domain pack")
}

fn observation(id: &str, text: &str) -> Observation {
    Observation {
        id: id.to_string(),
        source: "candidate".to_string(),
        text: text.to_string(),
        retract_evidence_ids: vec![],
    }
}

#[test]
fn rule_premise_must_positively_support_its_target() {
    let mut domain = pack();
    domain.rules.push(SessionRule {
        id: "contradictory-rule".to_string(),
        premises: vec!["uses_iteration".to_string()],
        track_id: "graph_dfs".to_string(),
        certainty: 1.0,
        concept: Some("termination".to_string()),
    });

    let error = validate_domain_pack(&domain).expect_err("contradictory rule must be refused");
    assert!(matches!(error, SessionError::InvalidDomain { .. }));
}

#[test]
fn rule_contribution_is_bounded_by_weakest_premise() {
    let mut domain = pack();
    domain
        .tracks
        .retain(|track| track.id == "coordinate_traversal");
    domain.tracks[0].concepts = vec![
        "state_representation".to_string(),
        "data_structure".to_string(),
    ];
    domain.patterns = vec![PatternSpec {
        id: "weak-observation".to_string(),
        phrases: vec!["weak".to_string()],
        proposition: "weak_fact".to_string(),
        track_weights: BTreeMap::from([("coordinate_traversal".to_string(), 0.2)]),
        concept: Some("state_representation".to_string()),
    }];
    domain.rules = vec![SessionRule {
        id: "weak-rule".to_string(),
        premises: vec!["weak_fact".to_string()],
        track_id: "coordinate_traversal".to_string(),
        certainty: 1.0,
        concept: Some("data_structure".to_string()),
    }];
    domain.aliases.clear();
    domain.thresholds.confidence = 0.1;
    domain.thresholds.margin = 0.0;
    domain.thresholds.minimum_coverage = 1;
    domain.thresholds.concept_coverage = 0.1;

    let output = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: None,
        observation: Some(observation("weak-1", "weak")),
        confirmation: None,
    })
    .expect("weak rule executes");

    let hypothesis = &output.projection.hypotheses[0];
    assert!(hypothesis
        .fired_rules
        .iter()
        .any(|rule| rule == "weak-rule"));
    assert!((hypothesis.support - 0.36).abs() < 0.000_001);
    assert!(output
        .projection
        .covered_concepts
        .iter()
        .any(|concept| concept == "data_structure"));
}

#[test]
fn commitment_reopens_when_minimum_coverage_is_lost() {
    let mut domain = pack();
    domain.thresholds.minimum_coverage = 4;
    let first = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(observation(
            "coordinate-1",
            "x and y dictionary of moves north south east west iterate",
        )),
        confirmation: None,
    })
    .expect("coordinate evidence admitted");
    assert_eq!(
        first.projection.pending_confirmation.as_deref(),
        Some("coordinate_traversal")
    );

    let confirmed = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: Some(first.state),
        observation: None,
        confirmation: Some(Confirmation {
            track_id: "coordinate_traversal".to_string(),
            accepted: true,
        }),
    })
    .expect("track confirmed");

    let data_structure_evidence = confirmed
        .state
        .evidence
        .iter()
        .find(|item| item.concept.as_deref() == Some("data_structure"))
        .expect("data-structure evidence")
        .id
        .clone();
    let reopened = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: Some(confirmed.state),
        observation: Some(Observation {
            id: "coordinate-2".to_string(),
            source: "candidate".to_string(),
            text: "follow up".to_string(),
            retract_evidence_ids: vec![data_structure_evidence],
        }),
        confirmation: None,
    })
    .expect("retraction admitted");

    assert!(reopened.state.committed_track.is_none());
    assert_eq!(reopened.state.phase, "track_identification");
}

#[test]
fn observation_ids_are_single_assignment_identifiers() {
    let domain = pack();
    let first = run_session_turn(&SessionTurnInput {
        domain_pack: domain.clone(),
        previous_state: None,
        observation: Some(observation("stable-id", "x and y")),
        confirmation: None,
    })
    .expect("first observation admitted");

    let error = run_session_turn(&SessionTurnInput {
        domain_pack: domain,
        previous_state: Some(first.state),
        observation: Some(observation("stable-id", "x and y")),
        confirmation: None,
    })
    .expect_err("duplicate identity must be refused");

    assert_eq!(
        error,
        SessionError::ObservationIdConflict {
            id: "stable-id".to_string()
        }
    );
}
