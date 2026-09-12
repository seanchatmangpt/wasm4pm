use wasm4pm_cognition::command_projection::{
    project_command, CommandProjectionInput, DiscVector, MedallionStage, ProjectionEffect,
    ProjectionFact, ProjectionFactKind, ProjectionProfile, ProjectionRefusal, StrategistProfile,
};

fn fact(
    id: &str,
    kind: ProjectionFactKind,
    value: &str,
    stage: MedallionStage,
    receipt: &str,
) -> ProjectionFact {
    ProjectionFact {
        id: id.to_string(),
        kind,
        value: value.to_string(),
        stage,
        source_receipt: receipt.to_string(),
    }
}

fn command_input() -> CommandProjectionInput {
    CommandProjectionInput {
        campaign_id: "campaign-42".to_string(),
        control_decision: "M17".to_string(),
        standing: "ALIVE".to_string(),
        facts: vec![
            fact(
                "decision-m17",
                ProjectionFactKind::Decision,
                "M17 is the qualified maneuver",
                MedallionStage::Qualified,
                "receipt-decision-17",
            ),
            fact(
                "option-loss",
                ProjectionFactKind::OptionLoss,
                "delay closes two lawful continuations",
                MedallionStage::Admitted,
                "receipt-option-9",
            ),
            fact(
                "unknown-vendor",
                ProjectionFactKind::Unknown,
                "vendor confirmation remains unresolved",
                MedallionStage::Admitted,
                "receipt-unknown-3",
            ),
            fact(
                "verification",
                ProjectionFactKind::Evidence,
                "exact subject was independently verified",
                MedallionStage::Verified,
                "receipt-verify-88",
            ),
        ],
    }
}

#[test]
fn disc_complement_is_projection_only_10_8_4_4_to_0_2_6_6() {
    let human = DiscVector::new(10, 8, 4, 4).expect("valid DISC vector");
    let complement = human.complement();
    assert_eq!(complement, DiscVector::new(0, 2, 6, 6).unwrap());

    let input = command_input();
    let action_first = project_command(
        &input,
        ProjectionProfile {
            strategist: StrategistProfile::Plain,
            disc: human,
        },
    )
    .unwrap();
    let evidence_first = project_command(
        &input,
        ProjectionProfile {
            strategist: StrategistProfile::Plain,
            disc: complement,
        },
    )
    .unwrap();

    assert!(action_first.text.contains("Action first"));
    assert!(evidence_first.text.contains("Evidence first"));
    assert_eq!(action_first.control_subject_hash, evidence_first.control_subject_hash);
    assert_ne!(action_first.projection_hash, evidence_first.projection_hash);
    assert_eq!(action_first.effect, ProjectionEffect::ReadOnly);
    assert_eq!(evidence_first.effect, ProjectionEffect::ReadOnly);
}

#[test]
fn strategist_changes_projection_but_never_control_identity() {
    let input = command_input();
    let disc = DiscVector::new(0, 2, 6, 6).unwrap();

    let napoleon = project_command(
        &input,
        ProjectionProfile {
            strategist: StrategistProfile::Napoleon,
            disc,
        },
    )
    .unwrap();
    let sun_tzu = project_command(
        &input,
        ProjectionProfile {
            strategist: StrategistProfile::SunTzu,
            disc,
        },
    )
    .unwrap();

    assert_eq!(napoleon.control_subject_hash, sun_tzu.control_subject_hash);
    assert_ne!(napoleon.projection_hash, sun_tzu.projection_hash);
    assert_ne!(napoleon.text, sun_tzu.text);
    assert_eq!(napoleon.template_id, "napoleon");
    assert_eq!(sun_tzu.template_id, "sun-tzu");
    assert!(napoleon.blackboard_selection.starts_with("headline:"));
    assert!(sun_tzu.blackboard_selection.starts_with("headline:"));
}

#[test]
fn bronze_observations_cannot_cross_the_projection_boundary() {
    let mut input = command_input();
    input.facts.push(fact(
        "raw-email",
        ProjectionFactKind::Unknown,
        "unadmitted email assertion",
        MedallionStage::Observed,
        "raw-source-1",
    ));

    let refusal = project_command(
        &input,
        ProjectionProfile {
            strategist: StrategistProfile::Plain,
            disc: DiscVector::new(0, 2, 6, 6).unwrap(),
        },
    )
    .expect_err("Bronze facts must fail closed");

    assert_eq!(
        refusal,
        ProjectionRefusal::UnadmittedFact("raw-email".to_string())
    );
}

#[test]
fn replay_is_bit_exact_for_same_subject_and_profile() {
    let input = command_input();
    let profile = ProjectionProfile {
        strategist: StrategistProfile::Clausewitz,
        disc: DiscVector::new(0, 2, 6, 6).unwrap(),
    };

    let first = project_command(&input, profile).unwrap();
    let replay = project_command(&input, profile).unwrap();

    assert_eq!(first, replay);
    assert_eq!(first.effect, ProjectionEffect::ReadOnly);
    assert_eq!(first.source_receipts.len(), 1);
    assert_eq!(first.cited_fact_ids.len(), 1);
}

#[test]
fn fact_order_does_not_change_control_subject_identity() {
    let input = command_input();
    let mut reversed = input.clone();
    reversed.facts.reverse();
    let profile = ProjectionProfile {
        strategist: StrategistProfile::Boyd,
        disc: DiscVector::new(0, 2, 6, 6).unwrap(),
    };

    let left = project_command(&input, profile).unwrap();
    let right = project_command(&reversed, profile).unwrap();

    assert_eq!(left.control_subject_hash, right.control_subject_hash);
    assert_eq!(left, right);
}
