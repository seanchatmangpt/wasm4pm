// crates/wasm4pm-cognition/tests/autonomic_healing_tests.rs
// 36 comprehensive tests for the autonomic bridge module.
// Registry: 9 real breed implementations (no stubs).
use wasm4pm_cognition::autonomic_bridge::*;
use wasm4pm_cognition::breeds::{BreedId, BreedInput, BreedOutput, Candidate, Fact, TraceStep};

/// Build a minimal valid BreedInput with the given intent.
fn input_with_intent(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

#[test]
fn test_autonomic_context_construction() {
    let ctx = AutonomicContext {
        health_level: 2,
        spc_alert_level: 1,
        circuit_state: 0,
        cycle_count: 100,
    };
    assert_eq!(ctx.health_level, 2);
    assert_eq!(ctx.cycle_count, 100);
}

#[test]
fn test_autonomic_context_boundary_health_zero() {
    let ctx = AutonomicContext {
        health_level: 0,
        spc_alert_level: 0,
        circuit_state: 0,
        cycle_count: 1,
    };
    assert_eq!(ctx.health_level, 0);
}

#[test]
fn test_autonomic_context_boundary_health_max() {
    let ctx = AutonomicContext {
        health_level: 4,
        spc_alert_level: 3,
        circuit_state: 2,
        cycle_count: u64::MAX,
    };
    assert_eq!(ctx.health_level, 4);
    assert!(ctx.is_critical());
    assert!(ctx.circuit_blocked());
}

#[test]
fn test_autonomic_context_new_clamps() {
    let ctx = AutonomicContext::new(9, 9, 9, 5);
    assert_eq!(ctx.health_level, 4);
    assert_eq!(ctx.spc_alert_level, 3);
    assert_eq!(ctx.circuit_state, 2);
}

#[test]
fn test_autonomic_context_default() {
    let ctx = AutonomicContext::default();
    assert_eq!(ctx.health_level, 0);
    assert!(!ctx.is_critical());
    assert!(!ctx.circuit_blocked());
}

#[test]
fn test_autonomic_context_to_facts() {
    let ctx = AutonomicContext::new(2, 1, 0, 100);
    let facts = ctx.to_facts();
    assert_eq!(facts.len(), 4);
    assert!(facts.iter().any(|f| f.key == "health_level" && f.value == "2"));
}

#[test]
fn test_breed_reward_signal_zero_base() {
    let signal = BreedRewardSignal {
        breed_id: "eliza".to_string(),
        base_reward: 0.0,
        confidence_bonus: 0.5,
        elimination_bonus: 0.0,
        fraud_penalty: 0.0,
        total_reward: 0.5,
    };
    assert_eq!(signal.total_reward, 0.5);
}

#[test]
fn test_breed_reward_signal_with_fraud_penalty() {
    let signal = BreedRewardSignal {
        breed_id: "cbr".to_string(),
        base_reward: 0.8,
        confidence_bonus: 0.1,
        elimination_bonus: 0.0,
        fraud_penalty: -2.0,
        total_reward: -1.1,
    };
    assert_eq!(signal.total_reward, -1.1);
}

#[test]
fn test_compute_breed_reward_with_valid_output() {
    let output = BreedOutput {
        breed: BreedId::Dendral,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.95,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "observation".to_string(),
            value: "test".to_string(),
        }],
        selected: Some("cand1".to_string()),
        explanation: "Dendral analyzed molecular structure".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "analysis".to_string(),
            detail: "Initial structure parsing".to_string(),
            depth: 0,
        }],
    };
    let signal = compute_breed_reward(&output);
    assert_eq!(signal.breed_id, "dendral");
    assert!(signal.base_reward > 0.0);
    assert!(signal.fraud_penalty == 0.0);
}

#[test]
fn test_compute_breed_reward_with_empty_trace_fraud_penalty() {
    let output = BreedOutput {
        breed: BreedId::Strips,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.8,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "STRIPS planning".to_string(),
        inference_trace: vec![], // FM-5: empty trace triggers fraud penalty
    };
    let signal = compute_breed_reward(&output);
    assert_eq!(signal.fraud_penalty, -2.0);
    assert!(signal.total_reward < 0.0);
}

#[test]
fn test_compute_breed_reward_with_no_selected_candidate() {
    let output = BreedOutput {
        breed: BreedId::Prolog,
        candidates: vec![
            Candidate {
                id: "cand1".to_string(),
                score: 0.7,
                eliminated: true,
                elimination_reason: Some("Failed proof".to_string()),
            },
            Candidate {
                id: "cand2".to_string(),
                score: 0.5,
                eliminated: true,
                elimination_reason: Some("Timeout".to_string()),
            },
        ],
        facts: vec![],
        selected: None,
        explanation: "Prolog inference exhausted search space".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "unification".to_string(),
            detail: "Attempted goal matching".to_string(),
            depth: 1,
        }],
    };
    let signal = compute_breed_reward(&output);
    assert!(signal.elimination_bonus > 0.0);
}

#[test]
fn test_compute_breed_reward_multiple_eliminations() {
    let output = BreedOutput {
        breed: BreedId::Mycin,
        candidates: vec![
            Candidate {
                id: "diag1".to_string(),
                score: 0.6,
                eliminated: true,
                elimination_reason: Some("Low confidence".to_string()),
            },
            Candidate {
                id: "diag2".to_string(),
                score: 0.4,
                eliminated: true,
                elimination_reason: Some("Evidence conflict".to_string()),
            },
            Candidate {
                id: "diag3".to_string(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        selected: Some("diag3".to_string()),
        explanation: "MYCIN medical diagnosis confidence".to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "rule_fire".to_string(),
                detail: "R1 triggered".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "rule_fire".to_string(),
                detail: "R2 triggered".to_string(),
                depth: 0,
            },
        ],
    };
    let signal = compute_breed_reward(&output);
    assert!(signal.elimination_bonus > 0.0);
    assert!(signal.total_reward > 0.0);
}

#[test]
fn test_compute_breed_reward_breed_id_lowercase() {
    let output = BreedOutput {
        breed: BreedId::Hearsay,
        candidates: vec![],
        facts: vec![],
        selected: None,
        explanation: "blackboard fusion".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "post".to_string(),
            detail: "hypothesis".to_string(),
            depth: 0,
        }],
    };
    let signal = compute_breed_reward(&output);
    assert_eq!(signal.breed_id, "hearsay");
}

#[test]
fn test_prioritize_breeds_full_health() {
    let ctx = AutonomicContext {
        health_level: 0,
        spc_alert_level: 0,
        circuit_state: 0,
        cycle_count: 1,
    };
    let priority = prioritize_breeds(&ctx);
    assert_eq!(priority.mode, DegradationMode::Full);
    assert!(!priority.preferred_breeds.is_empty());
    assert_eq!(priority.preferred_breeds.len(), 9);
}

#[test]
fn test_prioritize_breeds_degraded_health() {
    let ctx = AutonomicContext {
        health_level: 2,
        spc_alert_level: 2,
        circuit_state: 1,
        cycle_count: 50,
    };
    let priority = prioritize_breeds(&ctx);
    assert_eq!(priority.mode, DegradationMode::Minimal);
    assert_eq!(priority.preferred_breeds.len(), 3);
}

#[test]
fn test_prioritize_breeds_emergency() {
    let ctx = AutonomicContext {
        health_level: 4,
        spc_alert_level: 3,
        circuit_state: 2,
        cycle_count: 200,
    };
    let priority = prioritize_breeds(&ctx);
    assert_eq!(priority.mode, DegradationMode::Emergency);
    assert_eq!(priority.preferred_breeds, vec!["eliza".to_string()]);
}

#[test]
fn test_prioritize_breeds_circuit_open_forces_emergency() {
    let ctx = AutonomicContext {
        health_level: 0,
        spc_alert_level: 0,
        circuit_state: 2, // open
        cycle_count: 10,
    };
    let priority = prioritize_breeds(&ctx);
    assert_eq!(priority.mode, DegradationMode::Emergency);
}

#[test]
fn test_prioritize_breeds_spc_bumps_to_minimal() {
    let ctx = AutonomicContext {
        health_level: 0,
        spc_alert_level: 2,
        circuit_state: 0,
        cycle_count: 10,
    };
    let priority = prioritize_breeds(&ctx);
    assert_eq!(priority.mode, DegradationMode::Minimal);
}

#[test]
fn test_prioritize_breeds_rationale_mentions_registry() {
    let ctx = AutonomicContext::default();
    let priority = prioritize_breeds(&ctx);
    assert!(priority.rationale.contains("9 implemented breeds in registry"));
}

#[test]
fn test_enrich_input_with_context_adds_facts() {
    let input = input_with_intent("test intent");
    let original_facts = input.facts.len();
    let ctx = AutonomicContext {
        health_level: 2,
        spc_alert_level: 1,
        circuit_state: 0,
        cycle_count: 100,
    };
    let enriched = enrich_input_with_context(input, &ctx);
    assert!(enriched.facts.len() > original_facts);
    assert!(enriched.facts.iter().any(|f| f.key == "health_level"));
}

#[test]
fn test_enrich_input_preserves_intent() {
    let input = input_with_intent("original intent");
    let ctx = AutonomicContext {
        health_level: 0,
        spc_alert_level: 0,
        circuit_state: 0,
        cycle_count: 1,
    };
    let enriched = enrich_input_with_context(input, &ctx);
    assert_eq!(enriched.intent, "original intent");
}

#[test]
fn test_enrich_input_adds_all_four_facts() {
    let input = input_with_intent("intent");
    let ctx = AutonomicContext::new(1, 2, 1, 42);
    let enriched = enrich_input_with_context(input, &ctx);
    assert_eq!(enriched.facts.len(), 4);
}

#[test]
fn test_aggregate_rewards_empty_signals() {
    let signals = vec![];
    let agg = aggregate_rewards(&signals);
    assert_eq!(agg, 0.0);
}

#[test]
fn test_aggregate_rewards_single_signal() {
    let signals = vec![BreedRewardSignal {
        breed_id: "eliza".to_string(),
        base_reward: 0.5,
        confidence_bonus: 0.1,
        elimination_bonus: 0.0,
        fraud_penalty: 0.0,
        total_reward: 0.6,
    }];
    let agg = aggregate_rewards(&signals);
    assert_eq!(agg, 0.6);
}

#[test]
fn test_aggregate_rewards_multiple_signals() {
    let signals = vec![
        BreedRewardSignal {
            breed_id: "eliza".to_string(),
            base_reward: 0.5,
            confidence_bonus: 0.1,
            elimination_bonus: 0.0,
            fraud_penalty: 0.0,
            total_reward: 0.6,
        },
        BreedRewardSignal {
            breed_id: "cbr".to_string(),
            base_reward: 0.3,
            confidence_bonus: 0.0,
            elimination_bonus: 0.1,
            fraud_penalty: 0.0,
            total_reward: 0.4,
        },
    ];
    let agg = aggregate_rewards(&signals);
    assert!((agg - 0.5).abs() < 1e-6);
}

#[test]
fn test_aggregate_rewards_with_penalties() {
    let signals = vec![
        BreedRewardSignal {
            breed_id: "strips".to_string(),
            base_reward: 0.8,
            confidence_bonus: 0.2,
            elimination_bonus: 0.0,
            fraud_penalty: -2.0,
            total_reward: -1.0,
        },
        BreedRewardSignal {
            breed_id: "prolog".to_string(),
            base_reward: 0.6,
            confidence_bonus: 0.0,
            elimination_bonus: 0.0,
            fraud_penalty: 0.0,
            total_reward: 0.6,
        },
    ];
    let agg = aggregate_rewards(&signals);
    assert!((agg - (-0.2)).abs() < 1e-6);
}

#[test]
fn test_breed_id_from_str_eliza() {
    assert_eq!(breed_id_from_str("eliza"), Some(BreedId::Eliza));
}

#[test]
fn test_breed_id_from_str_cbr() {
    assert_eq!(breed_id_from_str("cbr"), Some(BreedId::Cbr));
}

#[test]
fn test_breed_id_from_str_dendral() {
    assert_eq!(breed_id_from_str("dendral"), Some(BreedId::Dendral));
}

#[test]
fn test_breed_id_from_str_strips() {
    assert_eq!(breed_id_from_str("strips"), Some(BreedId::Strips));
}

#[test]
fn test_breed_id_from_str_prolog() {
    assert_eq!(breed_id_from_str("prolog"), Some(BreedId::Prolog));
}

#[test]
fn test_breed_id_from_str_mycin() {
    assert_eq!(breed_id_from_str("mycin"), Some(BreedId::Mycin));
}

#[test]
fn test_breed_id_from_str_gps() {
    assert_eq!(breed_id_from_str("gps"), Some(BreedId::Gps));
}

#[test]
fn test_breed_id_from_str_soar() {
    assert_eq!(breed_id_from_str("soar"), Some(BreedId::Soar));
}

#[test]
fn test_breed_id_from_str_hearsay() {
    assert_eq!(breed_id_from_str("hearsay"), Some(BreedId::Hearsay));
}

#[test]
fn test_breed_id_from_str_invalid() {
    assert_eq!(breed_id_from_str("invalid_breed"), None);
}

#[test]
fn test_breed_id_from_str_case_insensitive() {
    assert_eq!(breed_id_from_str("ELIZA"), Some(BreedId::Eliza));
    assert_eq!(breed_id_from_str("Dendral"), Some(BreedId::Dendral));
}

#[test]
fn test_breed_id_from_str_empty() {
    assert_eq!(breed_id_from_str(""), None);
}
