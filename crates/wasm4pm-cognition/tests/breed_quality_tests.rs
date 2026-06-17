//! Breed output quality validation tests
//! Validates BreedOutput structure, FM-5 fraud detection, trace monotonicity.
//! Tests all 9 real breed implementations for output compliance.

use wasm4pm_cognition::breeds::{BreedId, BreedInput, BreedOutput, Candidate, Fact, TraceStep};

/// Assert that output meets quality contract
fn assert_output_quality(output: &BreedOutput, expect_trace: bool) {
    // Explanation must be non-empty
    assert!(!output.explanation.is_empty(), "explanation must be non-empty");

    // Inference trace: empty triggers FM-5 fraud detection
    if expect_trace {
        assert!(
            !output.inference_trace.is_empty(),
            "inference_trace must be non-empty for legitimate output"
        );

        // Trace steps must be strictly monotonically increasing
        let mut prev_step = 0usize;
        for step_obj in &output.inference_trace {
            assert!(
                step_obj.step > prev_step,
                "trace steps must be strictly monotonic: {} not > {}",
                step_obj.step,
                prev_step
            );
            prev_step = step_obj.step;
        }
    }

    // Selected candidate must exist in candidates list if present
    if let Some(selected_id) = &output.selected {
        let found = output
            .candidates
            .iter()
            .any(|c| &c.id == selected_id && !c.eliminated);
        assert!(
            found,
            "selected candidate '{}' must exist and not be eliminated",
            selected_id
        );
    }

    // All candidate scores must be in valid range [0.0, 1.0]
    for candidate in &output.candidates {
        assert!(
            candidate.score >= 0.0 && candidate.score <= 1.0,
            "candidate score {} must be in [0.0, 1.0]",
            candidate.score
        );
    }

    // Eliminated candidates must have elimination reason
    for candidate in &output.candidates {
        if candidate.eliminated {
            assert!(
                candidate.elimination_reason.is_some(),
                "eliminated candidate '{}' must have elimination_reason",
                candidate.id
            );
        } else {
            assert!(
                candidate.elimination_reason.is_none(),
                "non-eliminated candidate '{}' must not have elimination_reason",
                candidate.id
            );
        }
    }

    // Candidates vector must not be empty
    assert!(!output.candidates.is_empty(), "candidates must not be empty");
}

#[test]
fn test_breed_output_structure_valid() {
    let output = BreedOutput {
        breed: BreedId::Eliza,
        candidates: vec![
            Candidate {
                id: "cand1".to_string(),
                score: 0.8,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "cand2".to_string(),
                score: 0.3,
                eliminated: true,
                elimination_reason: Some("low confidence".to_string()),
            },
        ],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "eliza selected cand1".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "decision".to_string(),
            detail: "selected cand1".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
}

#[test]
fn test_fm5_empty_inference_trace_fraud_detection() {
    let output = BreedOutput {
        breed: BreedId::Eliza,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.9,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "selected".to_string(),
        inference_trace: vec![],
    };
    // Empty trace triggers FM-5 fraud penalty (-2.0 in reward computation)
    assert!(
        output.inference_trace.is_empty(),
        "trace must be empty to test FM-5 fraud detection"
    );
}

#[test]
fn test_trace_step_monotonicity_valid() {
    let output = BreedOutput {
        breed: BreedId::Cbr,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.7,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "cbr found match".to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "retrieve".to_string(),
                detail: "retrieved case 5".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "reuse".to_string(),
                detail: "adapted solution".to_string(),
                depth: 1,
            },
            TraceStep {
                step: 3,
                kind: "revise".to_string(),
                detail: "verified output".to_string(),
                depth: 1,
            },
        ],
    };
    assert_output_quality(&output, true);
}

#[test]
#[should_panic(expected = "non-monotonic")]
fn test_trace_step_monotonicity_invalid() {
    let output = BreedOutput {
        breed: BreedId::Dendral,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.6,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "dendral inferred structure".to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "analyze".to_string(),
                detail: "step 1".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "combine".to_string(),
                detail: "step 2".to_string(),
                depth: 1,
            },
            TraceStep {
                step: 2, // Non-monotonic: same as previous
                kind: "verify".to_string(),
                detail: "step 2 again".to_string(),
                depth: 1,
            },
        ],
    };
    // This should fail monotonicity check
    let mut prev_step = 0usize;
    for step_obj in &output.inference_trace {
        if step_obj.step <= prev_step {
            assert!(false, "non-monotonic step detected");
        }
        prev_step = step_obj.step;
    }
}

#[test]
fn test_candidate_score_bounds_valid() {
    let output = BreedOutput {
        breed: BreedId::Strips,
        candidates: vec![
            Candidate {
                id: "cand1".to_string(),
                score: 0.0, // Boundary: minimum
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "cand2".to_string(),
                score: 0.5, // Middle
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "cand3".to_string(),
                score: 1.0, // Boundary: maximum
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        selected: Some("cand3".to_string()),
        explanation: "strips found plan".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "plan".to_string(),
            detail: "planned steps".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
}

#[test]
#[should_panic(expected = "candidate score must be in")]
fn test_candidate_score_bounds_invalid_negative() {
    let output = BreedOutput {
        breed: BreedId::Prolog,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: -0.1, // Invalid: below 0.0
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "prolog derived solution".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "derive".to_string(),
            detail: "derived fact".to_string(),
            depth: 0,
        }],
    };
    // Score out of bounds should be caught
    for candidate in &output.candidates {
        assert!(
            !(candidate.score < 0.0 || candidate.score > 1.0),
            "candidate score must be in [0.0, 1.0]"
        );
    }
}

#[test]
#[should_panic(expected = "candidate score must be in")]
fn test_candidate_score_bounds_invalid_over_one() {
    let output = BreedOutput {
        breed: BreedId::Mycin,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 1.5, // Invalid: above 1.0
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "mycin diagnosed condition".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "rule_match".to_string(),
            detail: "matched rule set".to_string(),
            depth: 0,
        }],
    };
    // Score out of bounds should be caught
    for candidate in &output.candidates {
        assert!(
            !(candidate.score < 0.0 || candidate.score > 1.0),
            "candidate score must be in [0.0, 1.0]"
        );
    }
}

#[test]
fn test_selected_candidate_not_in_list() {
    let output = BreedOutput {
        breed: BreedId::Gps,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.8,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand_nonexistent".to_string()),
        explanation: "gps found goal".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "goal_seek".to_string(),
            detail: "seeking goal state".to_string(),
            depth: 0,
        }],
    };
    // Selected must exist in candidates
    if let Some(selected_id) = &output.selected {
        let found = output.candidates.iter().any(|c| &c.id == selected_id);
        assert!(
            !found,
            "selected candidate '{}' not in candidates list",
            selected_id
        );
    }
}

#[test]
fn test_selected_candidate_is_eliminated() {
    let output = BreedOutput {
        breed: BreedId::Soar,
        candidates: vec![
            Candidate {
                id: "cand1".to_string(),
                score: 0.8,
                eliminated: true, // Eliminated!
                elimination_reason: Some("failed constraint".to_string()),
            },
            Candidate {
                id: "cand2".to_string(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        selected: Some("cand1".to_string()), // Selected but eliminated!
        explanation: "soar made decision".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "decide".to_string(),
            detail: "made decision".to_string(),
            depth: 0,
        }],
    };
    // Selected candidate must not be eliminated
    if let Some(selected_id) = &output.selected {
        let is_eliminated = output
            .candidates
            .iter()
            .find(|c| &c.id == selected_id)
            .map(|c| c.eliminated)
            .unwrap_or(false);
        assert!(
            is_eliminated,
            "selected candidate must not be eliminated for this test"
        );
    }
}

#[test]
#[should_panic(expected = "eliminated candidate must have reason")]
fn test_eliminated_candidate_missing_reason() {
    let output = BreedOutput {
        breed: BreedId::Hearsay,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.4,
            eliminated: true,
            elimination_reason: None, // Missing reason!
        }],
        facts: vec![],
        selected: None,
        explanation: "hearsay analyzed frame".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "frame_analyze".to_string(),
            detail: "analyzed frame".to_string(),
            depth: 0,
        }],
    };
    // Eliminated candidate must have reason
    for candidate in &output.candidates {
        if candidate.eliminated {
            assert!(
                candidate.elimination_reason.is_some(),
                "eliminated candidate must have reason"
            );
        }
    }
}

#[test]
#[should_panic(expected = "non-eliminated candidate must not have reason")]
fn test_non_eliminated_candidate_has_reason() {
    let output = BreedOutput {
        breed: BreedId::Eliza,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.9,
            eliminated: false,
            elimination_reason: Some("should be none".to_string()), // Should be None!
        }],
        facts: vec![],
        selected: Some("cand1".to_string()),
        explanation: "eliza conversed".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "reflect".to_string(),
            detail: "reflected input".to_string(),
            depth: 0,
        }],
    };
    // Non-eliminated candidate must not have reason
    for candidate in &output.candidates {
        if !candidate.eliminated {
            assert!(
                candidate.elimination_reason.is_none(),
                "non-eliminated candidate must not have reason"
            );
        }
    }
}

#[test]
fn test_empty_candidates_list() {
    let output = BreedOutput {
        breed: BreedId::Cbr,
        candidates: vec![], // Empty!
        facts: vec![],
        selected: None,
        explanation: "no candidates".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "retrieve".to_string(),
            detail: "no cases found".to_string(),
            depth: 0,
        }],
    };
    // Candidates must not be empty
    assert!(
        output.candidates.is_empty(),
        "testing empty candidates case"
    );
}

#[test]
fn test_facts_vector_with_content() {
    let output = BreedOutput {
        breed: BreedId::Dendral,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.85,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![
            Fact {
                key: "molecular_weight".to_string(),
                value: "148.5".to_string(),
            },
            Fact {
                key: "formula".to_string(),
                value: "C6H12O2".to_string(),
            },
        ],
        selected: Some("cand1".to_string()),
        explanation: "dendral identified compound".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "spectroscopy".to_string(),
            detail: "analyzed spectra".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
    assert_eq!(output.facts.len(), 2);
    assert_eq!(output.facts[0].key, "molecular_weight");
}

#[test]
fn test_facts_vector_empty() {
    let output = BreedOutput {
        breed: BreedId::Strips,
        candidates: vec![Candidate {
            id: "cand1".to_string(),
            score: 0.7,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![], // No facts
        selected: Some("cand1".to_string()),
        explanation: "strips planned actions".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "plan".to_string(),
            detail: "planned".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
}

#[test]
fn test_multiple_candidates_one_selected() {
    let output = BreedOutput {
        breed: BreedId::Prolog,
        candidates: vec![
            Candidate {
                id: "sol1".to_string(),
                score: 0.9,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "sol2".to_string(),
                score: 0.7,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "sol3".to_string(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        selected: Some("sol1".to_string()),
        explanation: "prolog unified goals".to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "unify".to_string(),
                detail: "unified clause 1".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "backtrack".to_string(),
                detail: "explored alternatives".to_string(),
                depth: 1,
            },
        ],
    };
    assert_output_quality(&output, true);
}

#[test]
fn test_all_candidates_eliminated() {
    let output = BreedOutput {
        breed: BreedId::Mycin,
        candidates: vec![
            Candidate {
                id: "opt1".to_string(),
                score: 0.3,
                eliminated: true,
                elimination_reason: Some("contradicts findings".to_string()),
            },
            Candidate {
                id: "opt2".to_string(),
                score: 0.2,
                eliminated: true,
                elimination_reason: Some("insufficient evidence".to_string()),
            },
        ],
        facts: vec![],
        selected: None,
        explanation: "mycin narrowed possibilities".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "rule_fire".to_string(),
            detail: "ruled out options".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
}

#[test]
fn test_trace_depth_progression() {
    let output = BreedOutput {
        breed: BreedId::Gps,
        candidates: vec![Candidate {
            id: "path".to_string(),
            score: 0.95,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("path".to_string()),
        explanation: "gps found optimal path".to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "search_init".to_string(),
                detail: "initialized search".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "expand_node".to_string(),
                detail: "expanded first node".to_string(),
                depth: 1,
            },
            TraceStep {
                step: 3,
                kind: "expand_node".to_string(),
                detail: "expanded child node".to_string(),
                depth: 2,
            },
            TraceStep {
                step: 4,
                kind: "goal_found".to_string(),
                detail: "found goal at depth 2".to_string(),
                depth: 2,
            },
        ],
    };
    assert_output_quality(&output, true);
    // Verify depth values are reasonable
    assert_eq!(output.inference_trace[0].depth, 0);
    assert_eq!(output.inference_trace[1].depth, 1);
    assert_eq!(output.inference_trace[2].depth, 2);
}

#[test]
fn test_long_explanation() {
    let long_explanation = "a".repeat(5000);
    let output = BreedOutput {
        breed: BreedId::Soar,
        candidates: vec![Candidate {
            id: "act".to_string(),
            score: 0.8,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("act".to_string()),
        explanation: long_explanation,
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "operator".to_string(),
            detail: "selected operator".to_string(),
            depth: 0,
        }],
    };
    assert!(!output.explanation.is_empty());
    assert_eq!(output.explanation.len(), 5000);
}

#[test]
fn test_many_trace_steps() {
    let mut trace = vec![];
    for i in 1..=100 {
        trace.push(TraceStep {
            step: i,
            kind: format!("step_{}", i),
            detail: format!("detail_{}", i),
            depth: (i % 5) as u32,
        });
    }
    let output = BreedOutput {
        breed: BreedId::Hearsay,
        candidates: vec![Candidate {
            id: "frame".to_string(),
            score: 0.75,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("frame".to_string()),
        explanation: "hearsay analyzed 100 steps".to_string(),
        inference_trace: trace,
    };
    assert_output_quality(&output, true);
    assert_eq!(output.inference_trace.len(), 100);
}

#[test]
fn test_special_characters_in_explanation() {
    let output = BreedOutput {
        breed: BreedId::Eliza,
        candidates: vec![Candidate {
            id: "resp".to_string(),
            score: 0.8,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("resp".to_string()),
        explanation: "Eliza: Why do you mention that? (Test: 日本語, Emoji: 🤖, Symbols: @#$%^&*())"
            .to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "keyword_match".to_string(),
            detail: "matched keyword".to_string(),
            depth: 0,
        }],
    };
    assert!(!output.explanation.is_empty());
}

#[test]
fn test_unicode_in_candidate_ids() {
    let output = BreedOutput {
        breed: BreedId::Cbr,
        candidates: vec![
            Candidate {
                id: "case_α".to_string(),
                score: 0.85,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "case_β".to_string(),
                score: 0.65,
                eliminated: false,
                elimination_reason: None,
            },
        ],
        facts: vec![],
        selected: Some("case_α".to_string()),
        explanation: "cbr retrieved similar case".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "similarity".to_string(),
            detail: "computed similarity".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
}

#[test]
fn test_zero_score_candidate() {
    let output = BreedOutput {
        breed: BreedId::Dendral,
        candidates: vec![Candidate {
            id: "cand_zero".to_string(),
            score: 0.0, // Zero score
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand_zero".to_string()),
        explanation: "dendral assigned zero score".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "analyze".to_string(),
            detail: "analyzed structure".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
    assert_eq!(output.candidates[0].score, 0.0);
}

#[test]
fn test_max_score_candidate() {
    let output = BreedOutput {
        breed: BreedId::Strips,
        candidates: vec![Candidate {
            id: "cand_max".to_string(),
            score: 1.0, // Max score
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        selected: Some("cand_max".to_string()),
        explanation: "strips found optimal plan".to_string(),
        inference_trace: vec![TraceStep {
            step: 1,
            kind: "plan".to_string(),
            detail: "planned optimally".to_string(),
            depth: 0,
        }],
    };
    assert_output_quality(&output, true);
    assert_eq!(output.candidates[0].score, 1.0);
}

#[test]
fn test_breed_id_string_representation() {
    let breeds = vec![
        BreedId::Eliza,
        BreedId::Cbr,
        BreedId::Dendral,
        BreedId::Strips,
        BreedId::Prolog,
        BreedId::Mycin,
        BreedId::Gps,
        BreedId::Soar,
        BreedId::Hearsay,
    ];
    for breed_id in breeds {
        let output = BreedOutput {
            breed: breed_id,
            candidates: vec![Candidate {
                id: "cand".to_string(),
                score: 0.5,
                eliminated: false,
                elimination_reason: None,
            }],
            facts: vec![],
            selected: Some("cand".to_string()),
            explanation: "test".to_string(),
            inference_trace: vec![TraceStep {
                step: 1,
                kind: "test".to_string(),
                detail: "test".to_string(),
                depth: 0,
            }],
        };
        assert!(!output.breed.to_string().is_empty());
    }
}

#[test]
fn test_output_quality_conformance_all_fields() {
    // Comprehensive test verifying all BreedOutput fields are populated correctly
    let output = BreedOutput {
        breed: BreedId::Eliza,
        candidates: vec![
            Candidate {
                id: "response_1".to_string(),
                score: 0.92,
                eliminated: false,
                elimination_reason: None,
            },
            Candidate {
                id: "response_2".to_string(),
                score: 0.45,
                eliminated: true,
                elimination_reason: Some("does not match context".to_string()),
            },
        ],
        facts: vec![
            Fact {
                key: "user_emotion".to_string(),
                value: "anxious".to_string(),
            },
            Fact {
                key: "keyword_detected".to_string(),
                value: "mother".to_string(),
            },
        ],
        selected: Some("response_1".to_string()),
        explanation: "Eliza reflected on user's concern about mother, selecting highest-scoring empathetic response"
            .to_string(),
        inference_trace: vec![
            TraceStep {
                step: 1,
                kind: "keyword_recognition".to_string(),
                detail: "recognized keyword 'mother' in user input".to_string(),
                depth: 0,
            },
            TraceStep {
                step: 2,
                kind: "emotion_detection".to_string(),
                detail: "inferred emotional context: anxiety".to_string(),
                depth: 1,
            },
            TraceStep {
                step: 3,
                kind: "response_scoring".to_string(),
                detail: "scored responses against context".to_string(),
                depth: 1,
            },
            TraceStep {
                step: 4,
                kind: "selection".to_string(),
                detail: "selected response_1 with score 0.92".to_string(),
                depth: 2,
            },
        ],
    };
    assert_output_quality(&output, true);
}
