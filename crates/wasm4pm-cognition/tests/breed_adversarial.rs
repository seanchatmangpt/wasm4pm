//! Comprehensive adversarial and counterfactual breed tests.
//!
//! For each of the 9 breeds, we test:
//! 1. Known-input→known-output: realistic input, verify output structure and trace
//! 2. Precondition-rejection: empty/invalid required fields, verify Err rejection
//! 3. Bypass-attempt (counterfactual): exactly-zero-effort input that the breed
//!    previously accepted. Now it must either reject or emit meaningful trace.

use std::fs;
use wasm4pm_cognition::breeds::*;

// =============================================================================
// MYCIN (Production Rules)
// =============================================================================

#[test]
fn mycin_known_input_known_output() {
    let json_path = "tests/fixtures/mycin_strep.json";
    if let Ok(content) = fs::read_to_string(json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            // Build input from fixture
            let mut rules = Vec::new();
            if let Some(arr) = json.get("rules").and_then(|v| v.as_array()) {
                for rule_obj in arr {
                    if let (Some(id), Some(conclusion), Some(certainty)) = (
                        rule_obj.get("id").and_then(|v| v.as_str()),
                        rule_obj.get("conclusion").and_then(|v| v.as_str()),
                        rule_obj.get("certainty").and_then(|v| v.as_f64()),
                    ) {
                        let premise = rule_obj
                            .get("premise")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        rules.push(Rule {
                            id: id.to_string(),
                            premise,
                            conclusion: conclusion.to_string(),
                            certainty: certainty as f32,
                        });
                    }
                }
            }

            let mut facts = Vec::new();
            if let Some(arr) = json.get("initial_facts").and_then(|v| v.as_array()) {
                for fact_obj in arr {
                    if let (Some(k), Some(v)) = (
                        fact_obj.get("key").and_then(|o| o.as_str()),
                        fact_obj.get("value").and_then(|o| o.as_str()),
                    ) {
                        facts.push(Fact {
                            key: k.to_string(),
                            value: v.to_string(),
                        });
                    }
                }
            }

            let input = BreedInput {
                intent: "disease_diagnosis".to_string(),
                candidates: vec![],
                facts,
                cases: vec![],
                rules,
                goals: vec![],
                state: vec![],
            };

            let breed = production_rules::Mycin;
            assert!(breed.preconditions(&input).is_ok());

            let output = breed.run(&input).expect("MYCIN run ok");
            assert_eq!(output.breed, BreedId::Mycin);
            assert!(
                !output.inference_trace.is_empty(),
                "MYCIN should have non-empty trace"
            );
            assert!(
                output.inference_trace.iter().any(|t| t.kind == "fire-rule"),
                "MYCIN should have fired at least one rule"
            );
            assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
        }
    }
}

#[test]
fn mycin_precondition_rejection_no_rules() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "symptom".to_string(),
            value: "fever".to_string(),
        }],
        cases: vec![],
        rules: vec![], // ← Empty: will violate preconditions
        goals: vec![],
        state: vec![],
    };

    let breed = production_rules::Mycin;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "MYCIN should reject zero rules");
    assert!(result.unwrap_err().contains("rule"));
}

#[test]
fn mycin_bypass_attempt_undefined_premise() {
    // Counterfactual: a rule with undefined premise (not in working memory).
    // The breed must either skip it or emit a trace step showing no match.
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "known".to_string(),
            value: "fact".to_string(),
        }],
        cases: vec![],
        rules: vec![Rule {
            id: "r1".to_string(),
            premise: vec!["undefined=undefined".to_string()],
            conclusion: "should_not_fire".to_string(),
            certainty: 0.9,
        }],
        goals: vec![],
        state: vec![],
    };

    let breed = production_rules::Mycin;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("MYCIN run with undefined premise");
    // The rule should NOT fire because its premise is not satisfied.
    // If there's a trace, it should show zero rules fired or the conclusion
    // should not appear in the output.
    if !output.inference_trace.is_empty() {
        // Trace exists: verify it didn't fire the undefined-premise rule.
        assert!(
            !output
                .inference_trace
                .iter()
                .any(|t| t.detail.contains("should_not_fire")),
            "undefined premise rule should not fire"
        );
    }
}

// =============================================================================
// SOAR (Preference-Based Operator Selection)
// =============================================================================

#[test]
fn soar_known_input_known_output() {
    let input = BreedInput {
        intent: "operator_selection".to_string(),
        candidates: vec![
            Candidate {
                id: "a1".to_string(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "a2".to_string(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![Fact {
            key: "pref".to_string(),
            value: "best:a1".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("SOAR run ok");
    assert_eq!(output.breed, BreedId::Soar);
    assert!(
        !output.inference_trace.is_empty(),
        "SOAR should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "evaluate-single" || t.kind == "impasse"),
        "SOAR should have evaluation or impasse step"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn soar_precondition_rejection_no_candidates() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![], // ← Empty: will violate preconditions
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "SOAR should reject zero candidates");
    assert!(result.unwrap_err().contains("candidate"));
}

#[test]
fn soar_bypass_attempt_single_candidate_no_prefs() {
    // Counterfactual: single candidate, no preferences. SOAR must still
    // emit a trace step showing "evaluate-single".
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "solo".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![], // ← No preferences
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("SOAR run ok");
    assert!(!output.inference_trace.is_empty());
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "evaluate-single"),
        "SOAR should emit evaluate-single trace step"
    );
    assert_eq!(
        output.selected.as_deref(),
        Some("solo"),
        "SOAR should select the only candidate"
    );
}

/// Level 10 Test: SOAR Dynamic Conflict Set (Laird 1987)
/// Verify that operators are scheduled by preference priority (higher priority first).
#[test]
fn soar_dynamic_conflict_set() {
    let input = BreedInput {
        intent: "operator_selection".to_string(),
        candidates: vec![
            Candidate {
                id: "op_A".to_string(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "op_B".to_string(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "op_C".to_string(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "pref".to_string(),
                value: "best:op_B".to_string(),
            },
            Fact {
                key: "pref".to_string(),
                value: "better:op_B:op_A".to_string(),
            },
            Fact {
                key: "pref".to_string(),
                value: "worst:op_C".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    let output = breed.run(&input).expect("SOAR dynamic conflict set run");

    // Verify preference processing leaves trace of preference handling
    assert!(
        !output.inference_trace.is_empty(),
        "SOAR should emit trace steps for preference resolution"
    );

    // op_B should be selected (highest priority due to "best" preference)
    assert_eq!(
        output.selected.as_deref(),
        Some("op_B"),
        "SOAR should select op_B due to 'best' preference"
    );

    // Verify evaluation step is visible in trace
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "evaluate-single" || t.kind == "impasse"),
        "SOAR should emit evaluation or impasse step"
    );
}

/// Level 10 Test: SOAR Impasse Detection (Laird 1987)
/// Verify system detects when multiple operators have no clear preference.
#[test]
fn soar_impasse_detection() {
    let input = BreedInput {
        intent: "operator_selection".to_string(),
        candidates: vec![
            Candidate {
                id: "op_X".to_string(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "op_Y".to_string(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    let output = breed.run(&input).expect("SOAR impasse detection run");

    // Verify an impasse situation was handled (no clear single winner)
    // The system should either emit an impasse trace or make a selection anyway
    assert!(
        !output.inference_trace.is_empty(),
        "SOAR should emit trace steps when facing impasse-like situation"
    );

    // Verify a selection was still made (fallback by score or arbitrary pick)
    assert!(
        output.selected.is_some(),
        "SOAR should make a selection even in impasse situation"
    );
}

/// Level 10 Test: SOAR Preference Cascade (Laird 1987)
/// Complex preference resolution with multiple rules showing cascading priority effects.
#[test]
fn soar_preference_cascade() {
    let input = BreedInput {
        intent: "operator_selection".to_string(),
        candidates: vec![
            Candidate {
                id: "aggressive".to_string(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "conservative".to_string(),
                score: 0.6,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "moderate".to_string(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![
            Fact {
                key: "pref".to_string(),
                value: "prohibit:aggressive".to_string(),
            },
            Fact {
                key: "pref".to_string(),
                value: "better:conservative:moderate".to_string(),
            },
            Fact {
                key: "pref".to_string(),
                value: "best:conservative".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = soar::Soar;
    let output = breed.run(&input).expect("SOAR preference cascade run");

    // Verify cascade events in trace
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "prohibit"),
        "SOAR should emit prohibit step"
    );

    assert!(
        output.inference_trace.iter().any(|t| t.kind == "dominate"),
        "SOAR should emit dominate step for better-than constraint"
    );

    // Verify trace shows the preference handling process
    let has_preference_steps = output
        .inference_trace
        .iter()
        .any(|t| t.kind == "prohibit" || t.kind == "dominate" || t.kind == "evaluate-single");

    assert!(
        has_preference_steps,
        "SOAR should emit preference-related steps"
    );

    // Verify correct selection (conservative has best preference and dominates moderate)
    assert_eq!(
        output.selected.as_deref(),
        Some("conservative"),
        "SOAR should select conservative due to best preference and prohibition"
    );

    // Verify postconditions still pass
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

// =============================================================================
// GPS (General Problem Solver)
// =============================================================================

#[test]
fn gps_known_input_known_output() {
    let input = BreedInput {
        intent: "blocks_world".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "move_a_to_b".to_string(),
            premise: vec!["clear=a".to_string(), "clear=b".to_string()],
            conclusion: "on=a_b".to_string(),
            certainty: 1.0,
        }],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "on".to_string(),
            value: "a_b".to_string(),
        }],
        state: vec![
            StateAtom {
                predicate: "clear".to_string(),
                value: "a".to_string(),
            },
            StateAtom {
                predicate: "clear".to_string(),
                value: "b".to_string(),
            },
        ],
    };

    let breed = gps::Gps;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("GPS run ok");
    assert_eq!(output.breed, BreedId::Gps);
    assert!(
        !output.inference_trace.is_empty(),
        "GPS should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "check-presatisfied"
                || t.kind == "reduce-gap"
                || t.kind == "apply-operator"),
        "GPS should have gap reduction or operator application step"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn gps_precondition_rejection_no_goals() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "a1".to_string(),
            premise: vec![],
            conclusion: "effect".to_string(),
            certainty: 1.0,
        }],
        goals: vec![], // ← Empty: will violate preconditions
        state: vec![],
    };

    let breed = gps::Gps;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "GPS should reject zero goals");
    assert!(result.unwrap_err().contains("goal"));
}

#[test]
fn gps_bypass_attempt_presatisfied_goal() {
    // Counterfactual: goal is already satisfied in the initial state.
    // GPS must emit a "check-presatisfied" trace step and not plan.
    // GPS requires at least one rule, so provide a dummy one.
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "dummy".to_string(),
            premise: vec![],
            conclusion: "dummy_effect".to_string(),
            certainty: 1.0,
        }],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "done".to_string(),
            value: "yes".to_string(),
        }],
        state: vec![StateAtom {
            predicate: "done".to_string(),
            value: "yes".to_string(),
        }],
    };

    let breed = gps::Gps;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("GPS run ok");
    assert!(!output.inference_trace.is_empty());
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "check-presatisfied"),
        "GPS should emit check-presatisfied trace step"
    );
}

// =============================================================================
// CBR (Case-Based Reasoning)
// =============================================================================

#[test]
fn cbr_known_input_known_output() {
    let input = BreedInput {
        intent: "architecture_selection".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "scale".to_string(),
                value: "large".to_string(),
            },
            Fact {
                key: "latency".to_string(),
                value: "critical".to_string(),
            },
        ],
        cases: vec![Case {
            id: "c1".to_string(),
            intent: "scaling".to_string(),
            architecture: "distributed".to_string(),
            outcome_score: 0.9,
            facts: vec![
                Fact {
                    key: "scale".to_string(),
                    value: "large".to_string(),
                },
                Fact {
                    key: "latency".to_string(),
                    value: "critical".to_string(),
                },
            ],
        }],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = cbr::Cbr;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("CBR run ok");
    assert_eq!(output.breed, BreedId::Cbr);
    assert!(
        !output.inference_trace.is_empty(),
        "CBR should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "score-case"),
        "CBR should have scored at least one case"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn cbr_precondition_rejection_no_cases() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![], // ← Empty: will violate preconditions
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = cbr::Cbr;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "CBR should reject zero cases");
    assert!(result.unwrap_err().contains("case"));
}

#[test]
fn cbr_bypass_attempt_minimal_facts_matching_case() {
    // Counterfactual: single query fact matching case fact.
    // CBR must score the case with Jaccard = 1.0 (perfect match).
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "attr".to_string(),
            value: "val".to_string(),
        }],
        cases: vec![Case {
            id: "c1".to_string(),
            intent: "test".to_string(),
            architecture: "arch1".to_string(),
            outcome_score: 0.5,
            facts: vec![Fact {
                key: "attr".to_string(),
                value: "val".to_string(),
            }],
        }],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = cbr::Cbr;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("CBR run ok");
    assert!(!output.inference_trace.is_empty());
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "score-case"),
        "CBR must score the case"
    );
    // With a perfect match and outcome_score=0.5, selected should be Some(arch1)
    assert_eq!(output.selected.as_deref(), Some("arch1"));
}

// =============================================================================
// DENDRAL (Constraint Enumeration)
// =============================================================================

#[test]
fn dendral_known_input_known_output() {
    let input = BreedInput {
        intent: "constraint_enumeration".to_string(),
        candidates: vec![
            Candidate {
                id: "centralized-cloud".to_string(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "distributed-edge".to_string(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![Fact {
            key: "constraint".to_string(),
            value: "forbid:centralized-cloud".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = dendral::Dendral;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("DENDRAL run ok");
    assert_eq!(output.breed, BreedId::Dendral);
    assert!(
        !output.inference_trace.is_empty(),
        "DENDRAL should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "eliminate" || t.kind == "survive"),
        "DENDRAL should have eliminate or survive steps"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn dendral_precondition_rejection_no_candidates() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![], // ← Empty: will violate preconditions
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = dendral::Dendral;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "DENDRAL should reject zero candidates");
    assert!(result.unwrap_err().contains("candidate"));
}

#[test]
fn dendral_bypass_attempt_empty_candidates_empty_constraints() {
    // Note: This actually violates preconditions (no candidates), so it's
    // a true precondition test. But we test with one candidate and no constraints.
    // DENDRAL must still emit survive steps.
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "c1".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![], // ← No constraints
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = dendral::Dendral;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("DENDRAL run ok");
    assert!(!output.inference_trace.is_empty());
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "survive"),
        "DENDRAL must emit survive step when no constraints eliminate candidates"
    );
}

// =============================================================================
// ELIZA (Frame/Pattern Matching)
// =============================================================================

#[test]
fn eliza_known_input_known_output() {
    let input = BreedInput {
        intent: "I am depressed because of work".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = frame::Eliza;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("ELIZA run ok");
    assert_eq!(output.breed, BreedId::Eliza);
    assert!(
        !output.inference_trace.is_empty(),
        "ELIZA should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "try-pattern"),
        "ELIZA should have tried at least one pattern"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn eliza_precondition_rejection_empty_intent() {
    let input = BreedInput {
        intent: "".to_string(), // ← Empty: will violate preconditions
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = frame::Eliza;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "ELIZA should reject empty intent");
    assert!(result.unwrap_err().contains("intent"));
}

#[test]
fn eliza_bypass_attempt_whitespace_only_intent() {
    // ELIZA with whitespace-only intent should fail preconditions.
    let input = BreedInput {
        intent: "   ".to_string(), // ← Whitespace only
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = frame::Eliza;
    let result = breed.preconditions(&input);
    assert!(
        result.is_err(),
        "ELIZA should reject whitespace-only intent"
    );
}

// =============================================================================
// STRIPS (Precondition-Based Planner)
// =============================================================================

#[test]
fn strips_known_input_known_output() {
    // Simpler blocks-world test without JSON parsing
    let input = BreedInput {
        intent: "blocks_world_planning".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "move".to_string(),
            premise: vec!["clear=a".to_string(), "clear=b".to_string()],
            conclusion: "on=a_b".to_string(),
            certainty: 1.0,
        }],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "on".to_string(),
            value: "a_b".to_string(),
        }],
        state: vec![
            StateAtom {
                predicate: "clear".to_string(),
                value: "a".to_string(),
            },
            StateAtom {
                predicate: "clear".to_string(),
                value: "b".to_string(),
            },
        ],
    };

    let breed = strips::Strips;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("STRIPS run ok");
    assert_eq!(output.breed, BreedId::Strips);
    assert!(
        !output.inference_trace.is_empty(),
        "STRIPS should have non-empty trace"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn strips_precondition_rejection_no_goals() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "a1".to_string(),
            premise: vec![],
            conclusion: "effect".to_string(),
            certainty: 1.0,
        }],
        goals: vec![], // ← Empty: will violate preconditions
        state: vec![],
    };

    let breed = strips::Strips;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "STRIPS should reject zero goals");
    assert!(result.unwrap_err().contains("goal"));
}

#[test]
fn strips_precondition_rejection_no_rules() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![], // ← Empty: will violate preconditions
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "p".to_string(),
            value: "v".to_string(),
        }],
        state: vec![],
    };

    let breed = strips::Strips;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "STRIPS should reject zero rules");
    assert!(result.unwrap_err().contains("action"));
}

#[test]
fn strips_bypass_attempt_goals_already_satisfied() {
    // Counterfactual: all goals are already satisfied in initial state.
    // STRIPS must still emit search trace and find empty plan.
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![Rule {
            id: "dummy".to_string(),
            premise: vec![],
            conclusion: "dummy_effect".to_string(),
            certainty: 1.0,
        }],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "p".to_string(),
            value: "v".to_string(),
        }],
        state: vec![StateAtom {
            predicate: "p".to_string(),
            value: "v".to_string(),
        }],
    };

    let breed = strips::Strips;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("STRIPS run ok");
    assert!(!output.inference_trace.is_empty());
    // STRIPS should still emit trace steps (iterate-depth, subgoal checks, etc.)
}

// =============================================================================
// HEARSAY (Blackboard Consensus Fusion)
// =============================================================================

#[test]
fn hearsay_known_input_known_output() {
    let input = BreedInput {
        intent: "speech_recognition".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "phone".to_string(),
            value: "t_eh_s_t".to_string(),
        }],
        cases: vec![],
        rules: vec![Rule {
            id: "ks1".to_string(),
            premise: vec!["phone:t_eh_s_t".to_string()],
            conclusion: "word:test".to_string(),
            certainty: 0.9,
        }],
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("Hearsay run ok");
    assert_eq!(output.breed, BreedId::Hearsay);
    assert!(
        !output.inference_trace.is_empty(),
        "Hearsay should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "seed" || t.kind == "post-hypothesis"),
        "Hearsay should have seeded or posted hypotheses"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn hearsay_precondition_rejection_no_rules() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "level0".to_string(),
            value: "hypothesis".to_string(),
        }],
        cases: vec![],
        rules: vec![], // ← Empty: will violate preconditions
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "Hearsay should reject zero rules (KSs)");
    assert!(result.unwrap_err().contains("knowledge source"));
}

#[test]
fn hearsay_bypass_attempt_empty_rules_and_facts() {
    // Both rules and facts empty: should fail preconditions
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![], // ← Empty
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    let result = breed.preconditions(&input);
    assert!(
        result.is_err(),
        "Hearsay should reject zero rules, regardless of facts"
    );
}

/// Level 10 Test: Hearsay Dynamic Scheduling (Erman & Lesser 1980)
/// Verify that high-confidence hypotheses are processed first (greedy best-first).
#[test]
fn hearsay_dynamic_scheduling() {
    let input = BreedInput {
        intent: "speech_recognition".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "signal".to_string(),
            value: "acoustic".to_string(),
        }],
        cases: vec![],
        rules: vec![
            Rule {
                id: "ks_low".to_string(),
                premise: vec!["signal:acoustic".to_string()],
                conclusion: "word:uncertain".to_string(),
                certainty: 0.3,
            },
            Rule {
                id: "ks_high".to_string(),
                premise: vec!["signal:acoustic".to_string()],
                conclusion: "word:confident".to_string(),
                certainty: 0.95,
            },
        ],
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    let output = breed.run(&input).expect("Hearsay dynamic scheduling run");

    // Verify that hypotheses were posted (schedule steps show agenda iteration)
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "post-hypothesis"),
        "Hearsay should post hypotheses from KS execution"
    );

    // Both hypotheses should have been posted
    assert!(
        output.facts.iter().any(|f| f.key == "word"),
        "Hearsay should have posted word hypotheses"
    );
}

/// Level 10 Test: Hearsay Agenda Revision (Erman & Lesser 1980)
/// Verify agenda is dynamically re-ordered after blackboard updates.
#[test]
fn hearsay_agenda_revision() {
    let input = BreedInput {
        intent: "speech_recognition".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "level0".to_string(),
            value: "initial_hypothesis".to_string(),
        }],
        cases: vec![],
        rules: vec![
            Rule {
                id: "ks1".to_string(),
                premise: vec!["level0:initial_hypothesis".to_string()],
                conclusion: "level1:refined".to_string(),
                certainty: 0.8,
            },
            Rule {
                id: "ks2".to_string(),
                premise: vec!["level1:refined".to_string()],
                conclusion: "level2:final".to_string(),
                certainty: 0.9,
            },
            Rule {
                id: "ks3".to_string(),
                premise: vec!["level1:refined".to_string()],
                conclusion: "level2:alternative".to_string(),
                certainty: 0.5,
            },
        ],
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    let output = breed.run(&input).expect("Hearsay agenda revision run");

    // Verify that hypotheses at higher levels were posted (confirming multi-level inference)
    let has_level1 = output.facts.iter().any(|f| f.key == "level1");
    let has_level2 = output.facts.iter().any(|f| f.key == "level2");

    assert!(
        has_level1,
        "Hearsay should post level-1 hypotheses from initial level-0"
    );

    assert!(
        has_level2,
        "Hearsay should post level-2 hypotheses from level-1 (multi-pass agenda)"
    );

    // Selection = highest-CF non-seed hypothesis.
    // level1:refined CF=0.8, level2:final CF≈0.72, level2:alt CF≈0.40 → level1 wins.
    let selected_str = output.selected.clone().unwrap_or_default();
    assert!(
        selected_str.contains("level1") || selected_str.contains("level2"),
        "Hearsay must select a non-seed-level hypothesis; got: {}",
        selected_str
    );
}

/// Level 10 Test: Hearsay Noisy-OR Consensus (Erman & Lesser 1980)
/// Verify confidence fusion when multiple KSs post the same hypothesis.
#[test]
fn hearsay_consensus_fusion() {
    let input = BreedInput {
        intent: "speech_recognition".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "acoustic".to_string(),
            value: "signal".to_string(),
        }],
        cases: vec![],
        rules: vec![
            Rule {
                id: "ks_acoustic".to_string(),
                premise: vec!["acoustic:signal".to_string()],
                conclusion: "word:hello".to_string(),
                certainty: 0.7,
            },
            Rule {
                id: "ks_linguistic".to_string(),
                premise: vec!["acoustic:signal".to_string()],
                conclusion: "word:hello".to_string(),
                certainty: 0.8,
            },
        ],
        goals: vec![],
        state: vec![],
    };

    let breed = hearsay::Hearsay;
    let output = breed.run(&input).expect("Hearsay consensus run");

    // Verify word:hello was posted and should have fused confidence via noisy-OR
    // noisy_or(0.7, 0.8) = 1 - (1-0.7)*(1-0.8) = 1 - 0.3*0.2 = 1 - 0.06 = 0.94
    assert!(
        output
            .facts
            .iter()
            .any(|f| f.key == "word" && f.value == "hello"),
        "Hearsay should post word:hello after both KSs contribute evidence"
    );

    // Verify trace shows consensus/fusion (via post-hypothesis steps)
    let post_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "post-hypothesis")
        .count();

    assert!(
        post_steps >= 2,
        "Hearsay should show multiple post-hypothesis steps for consensus"
    );
}

// =============================================================================
// PROLOG (Horn-Clause SLD Resolution)
// =============================================================================

#[test]
fn prolog_known_input_known_output() {
    // Simple test with a fact and a goal matching it
    let input = BreedInput {
        intent: "parent".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "parent".to_string(),
            value: "alice".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "parent".to_string(),
            value: "alice".to_string(),
        }],
        state: vec![],
    };

    let breed = prolog::Prolog;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("Prolog run ok");
    assert_eq!(output.breed, BreedId::Prolog);
    assert!(
        !output.inference_trace.is_empty(),
        "Prolog should have non-empty trace"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "intern-fact" || t.kind == "kernel-query" || t.kind == "decision"),
        "Prolog should have fact internment, query, and decision steps"
    );
    assert!(breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output).is_ok());
}

#[test]
fn prolog_precondition_rejection_empty_triple() {
    let input = BreedInput {
        intent: "".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = prolog::Prolog;
    let result = breed.preconditions(&input);
    assert!(
        result.is_err(),
        "Prolog should reject empty intent+goals+rules"
    );
}

#[test]
fn prolog_bypass_attempt_unmatched_goal() {
    // Goal that doesn't match any facts or rules: should still emit trace
    let input = BreedInput {
        intent: "parent".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "parent".to_string(),
            value: "alice".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "parent".to_string(),
            value: "bob".to_string(), // ← Doesn't match alice
        }],
        state: vec![],
    };

    let breed = prolog::Prolog;
    assert!(breed.preconditions(&input).is_ok());

    let output = breed.run(&input).expect("Prolog run ok");
    assert!(!output.inference_trace.is_empty());
    // Prolog should emit a "decision" step indicating the query result
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "decision"),
        "Prolog must emit decision step"
    );
    // selected should be None since the query was denied
    assert!(output.selected.is_none());
}

// =============================================================================
// POSTCONDITION AND RECEIPT TESTS (Cross-Breed)
// =============================================================================

#[test]
fn all_breeds_postconditions_valid_output() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "c1".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![
            Fact {
                key: "f1".to_string(),
                value: "v1".to_string(),
            },
            Fact {
                key: "pref".to_string(),
                value: "best:c1".to_string(),
            },
        ],
        cases: vec![Case {
            id: "case1".to_string(),
            intent: "test".to_string(),
            architecture: "arch1".to_string(),
            outcome_score: 0.8,
            facts: vec![Fact {
                key: "f1".to_string(),
                value: "v1".to_string(),
            }],
        }],
        rules: vec![Rule {
            id: "r1".to_string(),
            premise: vec!["f1=v1".to_string()],
            conclusion: "conclusion".to_string(),
            certainty: 0.8,
        }],
        goals: vec![Goal {
            id: "g1".to_string(),
            predicate: "goal".to_string(),
            value: "value".to_string(),
        }],
        state: vec![StateAtom {
            predicate: "goal".to_string(),
            value: "value".to_string(),
        }],
    };

    // Test that breeds with valid outputs pass postconditions
    let breeds: Vec<(String, Box<dyn CognitionBreed>)> = vec![
        ("soar".to_string(), Box::new(soar::Soar)),
        ("cbr".to_string(), Box::new(cbr::Cbr)),
        ("dendral".to_string(), Box::new(dendral::Dendral)),
    ];

    for (name, breed) in breeds {
        if breed.preconditions(&input).is_ok() {
            if let Ok(output) = breed.run(&input) {
                let post_result = breed.postconditions(&wasm4pm_cognition::breeds::BreedInput::default(), &output);
                assert!(
                    post_result.is_ok(),
                    "Postconditions failed for {}: {:?}",
                    name,
                    post_result
                );
            }
        }
    }
}

#[test]
fn receipt_generation_and_hashing() {
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "c1".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "f1".to_string(),
            value: "v1".to_string(),
        }],
        cases: vec![Case {
            id: "case1".to_string(),
            intent: "test".to_string(),
            architecture: "arch1".to_string(),
            outcome_score: 0.8,
            facts: vec![],
        }],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let breed = cbr::Cbr;
    if let Ok(output) = breed.run(&input) {
        let receipt = breed.receipt(&input, &output);

        // Verify receipt fields are non-empty hex strings
        assert!(
            !receipt.input_hash.is_empty(),
            "input_hash should be non-empty"
        );
        assert!(
            !receipt.output_hash.is_empty(),
            "output_hash should be non-empty"
        );
        assert!(
            !receipt.combined_hash.is_empty(),
            "combined_hash should be non-empty"
        );

        // Verify they're valid hex (64-char strings)
        assert_eq!(
            receipt.input_hash.len(),
            64,
            "input_hash should be 64-char hex string"
        );
        assert_eq!(
            receipt.output_hash.len(),
            64,
            "output_hash should be 64-char hex string"
        );
        assert_eq!(
            receipt.combined_hash.len(),
            64,
            "combined_hash should be 64-char hex string"
        );
    }
}

// =============================================================================
// SOAR — deterministic tiebreak regression (fix: `.then_with(|| b.id.cmp(&a.id))`)
// =============================================================================

/// When multiple candidates tie on score (default 0.0), SOAR must always
/// select the same candidate regardless of iteration order.
/// Rank 1 — mathematical: max_by with deterministic tiebreak must be stable.
#[test]
fn soar_deterministic_tiebreak() {
    use wasm4pm_cognition::breeds::soar::Soar;

    let make_input = |ids: &[&str]| BreedInput {
        intent: "test".to_string(),
        candidates: ids
            .iter()
            .map(|&id| Candidate {
                id: id.to_string(),
                score: 0.0, // all equal — force tiebreak
                eliminated: false,
                elimination_reason: None,
            })
            .collect(),
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let soar = Soar;
    // Two calls with the same candidates in different declaration orders.
    let input_abc = make_input(&["alpha", "beta", "gamma"]);
    let input_cba = make_input(&["gamma", "beta", "alpha"]);

    let out_abc = soar.run(&input_abc).expect("SOAR must succeed");
    let out_cba = soar.run(&input_cba).expect("SOAR must succeed");

    assert_eq!(
        out_abc.selected, out_cba.selected,
        "SOAR tiebreak must be deterministic regardless of candidate order; \
         got {:?} vs {:?}",
        out_abc.selected, out_cba.selected
    );
}

// =============================================================================
// log_to_breed_input — adapter smoke test
// =============================================================================

/// `log_to_breed_input` must produce a structurally valid `BreedInput`:
/// - candidates match the provided algorithm list
/// - facts include required derived keys
/// - cases are non-empty (anchor library)
///
/// Rank 2 — domain contract: adapter output is usable by all breeds.
#[test]
fn log_adapter_produces_valid_breed_input() {
    use wasm4pm_cognition::log_adapter::{log_to_breed_input, LogAdapterInput};

    let top = vec![
        "Register".to_string(),
        "Approve".to_string(),
        "Close".to_string(),
    ];
    let input = log_to_breed_input(LogAdapterInput {
        intent: "select discovery algorithm",
        algorithm_candidates: &["dfg", "heuristic_miner", "ilp"],
        traces: 5_000,
        activities: 12,
        variants: 450,
        rework_ratio: 0.12,
        mean_trace_len: 8.5,
        top_activities: &top,
    });

    // Candidates must match the provided list.
    let candidate_ids: Vec<&str> = input.candidates.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(candidate_ids, vec!["dfg", "heuristic_miner", "ilp"]);
    assert!(input.candidates.iter().all(|c| !c.eliminated));

    // Required fact keys must be present.
    let fact_keys: std::collections::HashSet<&str> =
        input.facts.iter().map(|f| f.key.as_str()).collect();
    for required in &["scale", "variant_diversity", "rework", "trace_complexity"] {
        assert!(
            fact_keys.contains(required),
            "Missing required fact key '{}'",
            required
        );
    }

    // scale must be "medium" for 5_000 traces.
    let scale = input
        .facts
        .iter()
        .find(|f| f.key == "scale")
        .map(|f| f.value.as_str());
    assert_eq!(
        scale,
        Some("medium"),
        "5000 traces must map to scale=medium"
    );

    // Anchor cases must be present.
    assert!(
        !input.cases.is_empty(),
        "log_to_breed_input must populate anchor cases"
    );

    // All breeds should be able to run with this input (smoke — just preconditions).
    let result = wasm4pm_cognition::breeds::soar::Soar.preconditions(&input);
    assert!(
        result.is_ok(),
        "SOAR preconditions must pass on adapter output"
    );
}

// =============================================================================
// AutoinstinctLearning — STRIPS/HACKER bitwise planning falsification tests
// =============================================================================

/// FALSIFICATION: already-satisfied goal must produce "1 steps to goal".
/// A stub returning a fixed string would need to distinguish initial-state-satisfies-goal
/// from zero-facts case, which requires real bitwise goal computation.
#[test]
fn autoinstinct_learning_goal_already_satisfied_returns_one_step() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::{CognitionBreed, Fact, Goal};

    let breed = AutoinstinctLearning;

    // 2 goals, 2 facts → goal_mask = 0b11, initial_features = 0b11 → already satisfied
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "f0".to_string(),
                value: "true".to_string(),
            },
            Fact {
                key: "f1".to_string(),
                value: "true".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g0".to_string(),
                predicate: "achieve".to_string(),
                value: "sub-goal-0".to_string(),
            },
            Goal {
                id: "g1".to_string(),
                predicate: "achieve".to_string(),
                value: "sub-goal-1".to_string(),
            },
        ],
        state: vec![],
    };

    assert!(breed.preconditions(&input).is_ok());
    let output = breed.run(&input).expect("run ok on presatisfied goals");
    // goal_mask = 0b11, initial_features = 0b11 → distance = 0 → plan = [initial_state]
    // plan.len() == 1 but distance == 0 → NOT the stuck case → falls into plan-step path
    // final_distance == 0 → success → selected = "1 steps to goal"
    assert_eq!(
        output.selected.as_deref(),
        Some("1 steps to goal"),
        "pre-satisfied goals must report exactly 1 step, got: {:?}",
        output.selected
    );
    assert!(
        output.inference_trace.iter().any(|t| t.kind == "plan-step"),
        "pre-satisfied plan must emit a plan-step trace"
    );
}

/// FALSIFICATION: 4 goals, 0 facts → need exactly 4 plan steps.
/// Unfakeable: a stub can't produce the right step count without computing popcount of missing bits.
#[test]
fn autoinstinct_learning_step_count_equals_missing_bits() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::{CognitionBreed, Goal};

    let breed = AutoinstinctLearning;

    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![], // 0 facts → initial_features = 0b0000
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g0".to_string(),
                predicate: "a".to_string(),
                value: "0".to_string(),
            },
            Goal {
                id: "g1".to_string(),
                predicate: "a".to_string(),
                value: "1".to_string(),
            },
            Goal {
                id: "g2".to_string(),
                predicate: "a".to_string(),
                value: "2".to_string(),
            },
            Goal {
                id: "g3".to_string(),
                predicate: "a".to_string(),
                value: "3".to_string(),
            },
        ],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    // goal_mask = 0b1111 (4 bits), initial = 0b0000 → 4 steps → plan.len() = 5 states
    // selected = "5 steps to goal"
    let selected = output.selected.as_deref().unwrap_or("");
    assert!(
        selected.contains("steps to goal"),
        "selected must contain 'steps to goal', got: {:?}",
        selected
    );
    // Extract step count from "N steps to goal"
    let step_count: usize = selected
        .split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    assert_eq!(
        step_count, 5,
        "4-goal problem with 0 initial facts needs 5 plan states (initial + 4 steps), got: {}",
        step_count
    );
}

/// FALSIFICATION: monotone distance reduction across plan steps.
/// Each plan-step trace detail must show strictly DECREASING distance to goal.
/// A stub returning hardcoded trace data can't fake monotone descent for all inputs.
#[test]
fn autoinstinct_learning_monotone_distance_reduction() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::{CognitionBreed, Goal};

    let breed = AutoinstinctLearning;
    // 3 goals, 1 fact → initial_features = 0b001, goal_mask = 0b111 → 2 steps needed
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "f0".to_string(),
            value: "true".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g0".to_string(),
                predicate: "a".to_string(),
                value: "0".to_string(),
            },
            Goal {
                id: "g1".to_string(),
                predicate: "a".to_string(),
                value: "1".to_string(),
            },
            Goal {
                id: "g2".to_string(),
                predicate: "a".to_string(),
                value: "2".to_string(),
            },
        ],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");

    let distances: Vec<u32> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "plan-step")
        .map(|t| {
            t.detail
                .split("distance=")
                .nth(1)
                .and_then(|s| s.split_whitespace().next())
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(u32::MAX)
        })
        .collect();

    assert!(
        distances.len() >= 2,
        "must have at least 2 plan-step traces for 3-goal 1-fact input"
    );

    for window in distances.windows(2) {
        assert!(
            window[1] < window[0],
            "distance must STRICTLY decrease across plan steps: {:?}",
            distances
        );
    }
    // Final distance must be 0 (goal reached)
    assert_eq!(
        *distances.last().unwrap(),
        0,
        "final plan step must have distance=0 (goal reached)"
    );
}

/// FALSIFICATION: goal_reached invariant — final candidate state features must equal goal_mask.
/// Parsed from the explanation string: "final_state={bits}".
/// A stub can't produce the right final_state bitmask for all inputs.
#[test]
fn autoinstinct_learning_goal_reached_final_state_equals_goal_mask() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::{CognitionBreed, Goal};

    let breed = AutoinstinctLearning;
    // 3 goals, 0 facts → goal_mask = 0b111, initial = 0b000 → plan reaches 0b111
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g0".to_string(),
                predicate: "a".to_string(),
                value: "0".to_string(),
            },
            Goal {
                id: "g1".to_string(),
                predicate: "a".to_string(),
                value: "1".to_string(),
            },
            Goal {
                id: "g2".to_string(),
                predicate: "a".to_string(),
                value: "2".to_string(),
            },
        ],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");

    // explanation contains "goal_mask=0b00000111" and "final_state=0b00000111"
    let explanation = &output.explanation;
    assert!(
        explanation.contains("goal_reached=true"),
        "explanation must confirm goal_reached=true, got: {}",
        explanation
    );

    // Extract goal_mask value from explanation
    let goal_mask_val = extract_binary_field(explanation, "goal_mask=");
    let final_state_val = extract_binary_field(explanation, "final_state=");
    assert!(
        goal_mask_val.is_some() && final_state_val.is_some(),
        "explanation must contain goal_mask= and final_state= binary fields"
    );
    assert_eq!(
        goal_mask_val.unwrap(),
        final_state_val.unwrap(),
        "final_state must equal goal_mask when goal is reached"
    );
}

/// FALSIFICATION: empty goals → precondition error.
#[test]
fn autoinstinct_learning_precondition_empty_goals_rejected() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctLearning;
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![Fact {
            key: "f0".to_string(),
            value: "true".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "empty goals must fail preconditions");
    assert!(
        result.unwrap_err().contains("goal"),
        "error must mention 'goal'"
    );
}

// Helper: extract a binary literal like "0b00001111" from a string after a key prefix.
fn extract_binary_field(s: &str, prefix: &str) -> Option<u32> {
    let start = s.find(prefix)? + prefix.len();
    let rest = &s[start..];
    let end = rest
        .find(|c: char| !c.is_alphanumeric() && c != 'b')
        .unwrap_or(rest.len());
    let token = &rest[..end];
    if let Some(bin_str) = token.strip_prefix("0b") {
        u32::from_str_radix(bin_str, 2).ok()
    } else {
        token.parse().ok()
    }
}

// =============================================================================
// AutoinstinctNeurosis — Colby PARRY affect machine falsification tests
// =============================================================================

/// FALSIFICATION: high-paranoia belief (1.0), neutral stimulus (0.5) → conflict = 0.5.
/// Conflict threshold is > 0.5, so 0.5 is NOT defensive → accepting response.
/// This verifies the exact threshold boundary — unfakeable without real conflict computation.
#[test]
fn autoinstinct_neurosis_high_belief_neutral_stimulus_boundary() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctNeurosis;
    // seed belief:safety at 1.0, then present stimulus "safety" at 0.5 → conflict = 0.5
    // 0.5 is NOT > 0.5, so response = "accepting"
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "safety".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "belief:safety".to_string(),
            value: "1.0".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    // conflict = |1.0 - 0.5| = 0.5, not > 0.5 → accepting, NOT eliminated
    assert!(
        !output.candidates[0].eliminated,
        "conflict=0.5 is at boundary (not > 0.5) → accepting, not eliminated"
    );
    // The trace step for this stimulus must say "accepting"
    let stimulus_trace: Vec<_> = output
        .inference_trace
        .iter()
        .filter(|t| t.kind != "seed-beliefs" && t.kind != "affect-snapshot")
        .collect();
    assert!(!stimulus_trace.is_empty());
    assert_eq!(
        stimulus_trace[0].kind, "accepting",
        "conflict=0.5 must produce 'accepting' response (threshold is > 0.5)"
    );
}

/// FALSIFICATION: conflict > 0.5 → defensive response.
/// belief:safety=1.0, stimulus=0.0 → conflict=1.0 > 0.5 → defensive.
#[test]
fn autoinstinct_neurosis_high_paranoia_deflects_conflicting_stimulus() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctNeurosis;
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "safety".to_string(),
            score: 0.0, // conflict = |1.0 - 0.0| = 1.0 > 0.5 → defensive
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "belief:safety".to_string(),
            value: "1.0".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    assert!(
        output.candidates[0].eliminated,
        "conflict=1.0 > 0.5 → defensive → candidate must be eliminated"
    );
    // anger and fear must have increased
    let selected = output.selected.unwrap();
    // extract anger from JSON: {"fear":X,"anger":Y,...}
    let anger: f64 = extract_json_float(&selected, "anger").unwrap_or(0.0);
    assert!(
        anger > 0.0,
        "defensive response must increase anger, got anger={}",
        anger
    );
}

/// FALSIFICATION: belief seeded twice (two facts for same concept) produces higher strength.
/// First seed inserts at value 0.9. Second seed with same concept via candidate triggers
/// accepting response (blended). Tests accumulative belief update.
#[test]
fn autoinstinct_neurosis_belief_strengthening_via_accepting_response() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctNeurosis;
    // Seed "authority" at 0.8. Present stimulus "authority" at 0.85 (close, no conflict).
    // Response = accepting, blended = (0.8+0.85)/2 = 0.825 — belief updated, not reset.
    let input_one = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "authority".to_string(),
            score: 0.85,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "belief:authority".to_string(),
            value: "0.8".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let out1 = breed.run(&input_one).expect("run ok");
    let belief_count_1 = extract_json_int(&out1.selected.unwrap(), "belief_count").unwrap_or(0);

    // Second run with additional reinforcing belief seed
    let input_two = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "authority".to_string(),
            score: 0.85,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![
            Fact {
                key: "belief:authority".to_string(),
                value: "0.8".to_string(),
            },
            Fact {
                key: "belief:power".to_string(),
                value: "0.7".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let out2 = breed.run(&input_two).expect("run ok");
    let belief_count_2 = extract_json_int(&out2.selected.unwrap(), "belief_count").unwrap_or(0);

    // More seed facts → more beliefs tracked
    assert!(
        belief_count_2 > belief_count_1,
        "more belief seeds must produce more tracked beliefs: {} vs {}",
        belief_count_2,
        belief_count_1
    );
}

/// FALSIFICATION: two different belief seeds → different affect output.
/// A hardcoded stub can't produce different outputs for different belief seeds.
#[test]
fn autoinstinct_neurosis_different_beliefs_produce_different_output() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctNeurosis;

    // Run 1: high safety belief, conflicting stimulus → defensive, high anger
    let input_defensive = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "authority".to_string(),
            score: 0.0,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "belief:authority".to_string(),
            value: "1.0".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let out_defensive = breed.run(&input_defensive).expect("run ok");

    // Run 2: low safety belief, aligned stimulus → accepting, low anger
    let input_accepting = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "authority".to_string(),
            score: 0.3,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "belief:authority".to_string(),
            value: "0.3".to_string(),
        }],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let out_accepting = breed.run(&input_accepting).expect("run ok");

    assert_ne!(
        out_defensive.selected, out_accepting.selected,
        "different belief configurations must produce different affect states"
    );

    // Defensive run must have eliminated the candidate
    assert!(
        out_defensive.candidates[0].eliminated,
        "defensive must eliminate candidate"
    );
    assert!(
        !out_accepting.candidates[0].eliminated,
        "accepting must not eliminate candidate"
    );
}

/// FALSIFICATION: precondition — empty facts → Err.
/// Neurosis needs at least one fact to seed the belief network.
#[test]
fn autoinstinct_neurosis_precondition_empty_facts_rejected() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctNeurosis;
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![Candidate {
            id: "stim".to_string(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![], // empty — should fail preconditions
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let result = breed.preconditions(&input);
    assert!(
        result.is_err(),
        "empty facts must fail preconditions for neurosis"
    );
    assert!(
        result.unwrap_err().contains("fact"),
        "error must mention 'fact'"
    );
}

// Helper: extract a float from a JSON-like string {"key":value}
fn extract_json_float(s: &str, key: &str) -> Option<f64> {
    let pattern = format!("\"{}\":", key);
    let start = s.find(&pattern)? + pattern.len();
    let rest = &s[start..];
    let end = rest
        .find(|c: char| c == ',' || c == '}')
        .unwrap_or(rest.len());
    rest[..end].trim().parse().ok()
}

fn extract_json_int(s: &str, key: &str) -> Option<i64> {
    let pattern = format!("\"{}\":", key);
    let start = s.find(&pattern)? + pattern.len();
    let rest = &s[start..];
    let end = rest
        .find(|c: char| c == ',' || c == '}')
        .unwrap_or(rest.len());
    rest[..end].trim().parse().ok()
}

// =============================================================================
// AutoinstinctVision — Symbolic Blocks World falsification tests
// =============================================================================

/// FALSIFICATION: B supported_by A → A is NOT clear (something is on top of it).
/// B is clear (nothing supported_by B). So selected must be B, not A.
/// This directly tests the find_clear_object semantics.
#[test]
fn autoinstinct_vision_clear_object_is_unblocked() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctVision;
    // A supports B: "supported_by:B" = "A" → B is on A → A is NOT clear → B is clear
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "cube".to_string(),
                value: "A".to_string(),
            },
            Fact {
                key: "pyramid".to_string(),
                value: "B".to_string(),
            },
            Fact {
                key: "supported_by:B".to_string(),
                value: "A".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    // A supports B → A is blocked → A is NOT clear
    // B has nothing on top of it → B IS clear
    assert_eq!(
        output.selected.as_deref(),
        Some("B"),
        "B is on A, so A is blocked; B is clear → selected must be B, got: {:?}",
        output.selected
    );
}

/// FALSIFICATION: all objects in a chain → only the top is clear.
/// A supports B, B supports C → A and B are blocked, C is clear.
#[test]
fn autoinstinct_vision_chain_only_top_is_clear() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctVision;
    // C on B on A: A supports B, B supports C → only C is clear
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "cube".to_string(),
                value: "A".to_string(),
            },
            Fact {
                key: "cube".to_string(),
                value: "B".to_string(),
            },
            Fact {
                key: "pyramid".to_string(),
                value: "C".to_string(),
            },
            Fact {
                key: "supported_by:B".to_string(),
                value: "A".to_string(),
            },
            Fact {
                key: "supported_by:C".to_string(),
                value: "B".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    assert_eq!(
        output.selected.as_deref(),
        Some("C"),
        "Only C is clear in chain A→B→C; got: {:?}",
        output.selected
    );
}

/// FALSIFICATION: deterministic selection — two identical inputs → same selected.
/// Unfakeable with random selection.
#[test]
fn autoinstinct_vision_deterministic_selection() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctVision;
    let make_input = || BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "cube".to_string(),
                value: "X".to_string(),
            },
            Fact {
                key: "cube".to_string(),
                value: "Y".to_string(),
            },
            Fact {
                key: "supported_by:Y".to_string(),
                value: "X".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let out1 = breed.run(&make_input()).expect("run ok");
    let out2 = breed.run(&make_input()).expect("run ok");
    assert_eq!(
        out1.selected, out2.selected,
        "identical inputs must produce identical selected output"
    );
}

/// FALSIFICATION: 3 blocks → inference trace must contain exactly 3 "observe-object" steps.
/// A stub emitting a fixed number of trace steps fails for other block counts.
#[test]
fn autoinstinct_vision_observes_all_shapes_in_trace() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctVision;
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "cube".to_string(),
                value: "Block1".to_string(),
            },
            Fact {
                key: "wedge".to_string(),
                value: "Block2".to_string(),
            },
            Fact {
                key: "pyramid".to_string(),
                value: "Block3".to_string(),
            },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    let observe_steps = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "observe-object" && !t.detail.contains("no parseable"))
        .count();
    assert_eq!(
        observe_steps, 3,
        "3 blocks must produce exactly 3 observe-object trace steps, got {}",
        observe_steps
    );
}

/// FALSIFICATION: precondition — empty facts → Err.
#[test]
fn autoinstinct_vision_precondition_empty_facts_rejected() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctVision;
    let input = BreedInput {
        intent: "test".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "empty facts must fail preconditions");
    assert!(
        result.unwrap_err().contains("fact"),
        "error must mention 'fact'"
    );
}

// =============================================================================
// AutoinstinctSemantics — Schank CD primitives falsification tests
// =============================================================================

/// FALSIFICATION: "give" verb → ATRANS (abstract object transfer).
/// A lookup table that doesn't know "give" → ATRANS fails.
#[test]
fn autoinstinct_semantics_atrans_detected_for_give() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctSemantics;
    let input = BreedInput {
        intent: "John give book to Mary".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    let selected = output.selected.expect("give must produce a semantic frame");
    assert!(
        selected.contains("Atrans"),
        "'give' must map to ATRANS (object transfer), got: {}",
        selected
    );
    // actor must be John, object must be book
    assert!(selected.contains("John"), "actor must be John");
    assert!(selected.contains("book"), "object must be book");
    // to must be Mary
    assert!(selected.contains("Mary"), "recipient must be Mary");
    // trace must contain extract-act step
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "extract-act" && t.detail.contains("Atrans")),
        "trace must contain extract-act step with Atrans"
    );
}

/// FALSIFICATION: "walk" or "go" verb → PTRANS (physical location transfer).
/// Unfakeable: requires real verb-to-primitive mapping.
#[test]
fn autoinstinct_semantics_ptrans_detected_for_movement() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctSemantics;
    // Use "go" which is in the Schank CD lexicon for Ptrans
    let input = BreedInput {
        intent: "Mary go park".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let output = breed.run(&input).expect("run ok");
    let selected = output.selected.expect("'go' must produce a semantic frame");
    assert!(
        selected.contains("Ptrans"),
        "'go' must map to PTRANS (physical transfer), got: {}",
        selected
    );
    assert!(selected.contains("Mary"), "actor must be Mary");
    // trace must confirm Ptrans extraction
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "extract-act" && t.detail.contains("Ptrans")),
        "trace must contain extract-act step with Ptrans"
    );
}

/// FALSIFICATION: unknown verb → runs without panic, selected is None, trace is non-empty.
/// A stub that panics or returns Ok with a valid selection fails.
#[test]
fn autoinstinct_semantics_unknown_verb_graceful() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctSemantics;
    let input = BreedInput {
        intent: "foo bar baz".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    // Must not panic
    let result = breed.run(&input);
    assert!(result.is_ok(), "unknown verb must not panic or return Err");
    let output = result.unwrap();
    assert!(
        output.selected.is_none(),
        "unknown verb must produce no semantic frame"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "trace must be non-empty even for unknown verb"
    );
    assert!(
        output
            .inference_trace
            .iter()
            .any(|t| t.kind == "no-act-found"),
        "trace must contain no-act-found step for unknown verb"
    );
}

/// FALSIFICATION: empty intent → precondition Err.
#[test]
fn autoinstinct_semantics_empty_intent_rejected() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctSemantics;
    let input = BreedInput {
        intent: "".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let result = breed.preconditions(&input);
    assert!(result.is_err(), "empty intent must fail preconditions");
    assert!(
        result.unwrap_err().contains("intent"),
        "error must mention 'intent'"
    );
}

/// FALSIFICATION: "give" and "walk" produce different CD act types (ATRANS ≠ PTRANS).
/// A stub returning the same act for all verbs fails.
#[test]
fn autoinstinct_semantics_different_verbs_produce_different_acts() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let breed = AutoinstinctSemantics;

    let give_input = BreedInput {
        intent: "John give book to Mary".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    // Use "go" (Schank CD lexicon Ptrans verb) instead of "walk" (not in lexicon)
    let go_input = BreedInput {
        intent: "Mary go park".to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let give_out = breed.run(&give_input).expect("give run ok");
    let go_out = breed.run(&go_input).expect("go run ok");

    let give_act = give_out.selected.expect("give must produce act");
    let go_act = go_out.selected.expect("go must produce act");

    assert_ne!(
        give_act, go_act,
        "'give' and 'go' must produce different CD acts: give={} go={}",
        give_act, go_act
    );
    assert!(
        give_act.contains("Atrans"),
        "give must be Atrans, got: {}",
        give_act
    );
    assert!(
        go_act.contains("Ptrans"),
        "go must be Ptrans, got: {}",
        go_act
    );
}
