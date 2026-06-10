//! Dispatch breed smoke tests: native (non-WASM) tests validating each breed
//! routes correctly through the dispatch mechanism and produces non-empty traces.

use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedId, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

/// Create a minimal valid BreedInput for testing.
fn minimal_input() -> BreedInput {
    BreedInput {
        intent: "test intent".into(),
        candidates: vec![Candidate {
            id: "candidate-1".into(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![Fact {
            key: "test:fact".into(),
            value: "test-value".into(),
        }],
        cases: vec![],
        rules: vec![Rule {
            id: "rule-1".into(),
            premise: vec!["test:fact".into()],
            conclusion: "test-conclusion".into(),
            certainty: 0.8,
        }],
        goals: vec![Goal {
            id: "goal-1".into(),
            predicate: "performance".into(),
            value: "high".into(),
        }],
        state: vec![StateAtom {
            predicate: "ready".into(),
            value: "true".into(),
        }],
    }
}

/// Create a BreedInput with cases for CBR testing.
fn input_with_cases() -> BreedInput {
    let mut input = minimal_input();
    input.cases = vec![
        Case {
            id: "case-1".into(),
            intent: "similar intent".into(),
            architecture: "architecture-A".into(),
            outcome_score: 0.9,
            facts: vec![Fact {
                key: "test:fact".into(),
                value: "test-value".into(),
            }],
        },
        Case {
            id: "case-2".into(),
            intent: "different intent".into(),
            architecture: "architecture-B".into(),
            outcome_score: 0.5,
            facts: vec![Fact {
                key: "other:key".into(),
                value: "other-value".into(),
            }],
        },
    ];
    input
}

/// Create a BreedInput with reachable goals for STRIPS testing.
fn input_with_reachable_goals() -> BreedInput {
    let mut input = minimal_input();
    // Make the goal reachable from the initial state
    input.goals = vec![Goal {
        id: "goal-1".into(),
        predicate: "ready".into(),
        value: "true".into(),
    }];
    input.state = vec![StateAtom {
        predicate: "ready".into(),
        value: "true".into(),
    }];
    input
}

/// Create a BreedInput with MYCIN-style evidence facts.
fn input_with_evidence() -> BreedInput {
    let mut input = minimal_input();
    input.facts = vec![
        Fact {
            key: "symptom".into(),
            value: "fever".into(),
        },
        Fact {
            key: "symptom".into(),
            value: "cough".into(),
        },
    ];
    input.rules = vec![
        Rule {
            id: "rule-infection".into(),
            premise: vec!["symptom=fever".into(), "symptom=cough".into()],
            conclusion: "infection=true".into(),
            certainty: 0.85,
        },
        Rule {
            id: "rule-treat".into(),
            premise: vec!["infection=true".into()],
            conclusion: "treatment=antibiotics".into(),
            certainty: 0.8,
        },
    ];
    input
}

#[test]
fn dispatch_eliza_routes() {
    let input = minimal_input();
    let output = dispatch_breed_test("eliza", &input).expect("eliza dispatch failed");

    assert_eq!(output.breed, BreedId::Eliza, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "eliza must produce non-empty trace (fraud signal if empty)"
    );
    assert!(
        !output.explanation.is_empty(),
        "eliza must produce explanation"
    );
}

#[test]
fn dispatch_cbr_routes() {
    let input = input_with_cases();
    let output = dispatch_breed_test("cbr", &input).expect("cbr dispatch failed");

    assert_eq!(output.breed, BreedId::Cbr, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "cbr must produce non-empty trace"
    );
}

#[test]
fn dispatch_dendral_routes() {
    let input = minimal_input();
    let output = dispatch_breed_test("dendral", &input).expect("dendral dispatch failed");

    assert_eq!(output.breed, BreedId::Dendral, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "dendral must produce non-empty trace"
    );
}

#[test]
fn dispatch_strips_routes() {
    let input = input_with_reachable_goals();
    let output = dispatch_breed_test("strips", &input).expect("strips dispatch failed");

    assert_eq!(output.breed, BreedId::Strips, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "strips must produce non-empty trace"
    );
}

#[test]
fn dispatch_prolog_routes() {
    let input = minimal_input();
    let output = dispatch_breed_test("prolog", &input).expect("prolog dispatch failed");

    assert_eq!(output.breed, BreedId::Prolog, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "prolog must produce non-empty trace"
    );
}

#[test]
fn dispatch_mycin_routes() {
    let input = input_with_evidence();
    let output = dispatch_breed_test("mycin", &input).expect("mycin dispatch failed");

    assert_eq!(output.breed, BreedId::Mycin, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "mycin must produce non-empty trace"
    );
}

#[test]
fn dispatch_gps_routes() {
    let input = input_with_reachable_goals();
    let output = dispatch_breed_test("gps", &input).expect("gps dispatch failed");

    assert_eq!(output.breed, BreedId::Gps, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "gps must produce non-empty trace"
    );
}

#[test]
fn dispatch_soar_routes() {
    let input = minimal_input();
    let output = dispatch_breed_test("soar", &input).expect("soar dispatch failed");

    assert_eq!(output.breed, BreedId::Soar, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "soar must produce non-empty trace"
    );
}

#[test]
fn dispatch_hearsay_routes() {
    let input = minimal_input();
    let output = dispatch_breed_test("hearsay", &input).expect("hearsay dispatch failed");

    assert_eq!(output.breed, BreedId::Hearsay, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "hearsay must produce non-empty trace"
    );
}

#[test]
fn dispatch_autoinstinct_neurosis_routes() {
    let mut input = minimal_input();
    input.facts = vec![
        Fact {
            key: "belief:safety".into(),
            value: "0.8".into(),
        },
        Fact {
            key: "belief:control".into(),
            value: "0.3".into(),
        },
    ];
    let output = dispatch_breed_test("autoinstinct_neurosis", &input)
        .expect("autoinstinct_neurosis dispatch failed");

    assert_eq!(
        output.breed,
        BreedId::AutoinstinctNeurosis,
        "breed mismatch"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "autoinstinct_neurosis must produce non-empty trace"
    );
    assert!(
        output
            .selected
            .as_deref()
            .map(|s| s.contains("fear"))
            .unwrap_or(false),
        "selected must contain affect state with 'fear'"
    );
}

#[test]
fn dispatch_autoinstinct_vision_routes() {
    let mut input = minimal_input();
    input.facts = vec![
        Fact {
            key: "cube".into(),
            value: "A".into(),
        },
        Fact {
            key: "pyramid".into(),
            value: "B".into(),
        },
        Fact {
            key: "supported_by:B".into(),
            value: "A".into(),
        },
    ];
    let output = dispatch_breed_test("autoinstinct_vision", &input)
        .expect("autoinstinct_vision dispatch failed");

    assert_eq!(output.breed, BreedId::AutoinstinctVision, "breed mismatch");
    assert!(
        !output.inference_trace.is_empty(),
        "autoinstinct_vision must produce non-empty trace"
    );
    // B is on top of A → B is the clear object
    assert_eq!(
        output.selected.as_deref(),
        Some("B"),
        "B must be clear object"
    );
}

#[test]
fn dispatch_autoinstinct_semantics_routes() {
    let mut input = minimal_input();
    input.intent = "John give book to Mary".into();
    let output = dispatch_breed_test("autoinstinct_semantics", &input)
        .expect("autoinstinct_semantics dispatch failed");

    assert_eq!(
        output.breed,
        BreedId::AutoinstinctSemantics,
        "breed mismatch"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "autoinstinct_semantics must produce non-empty trace"
    );
    // Atrans extracted from "give"
    assert!(
        output
            .selected
            .as_deref()
            .map(|s| s.contains("Atrans"))
            .unwrap_or(false),
        "selected must contain Atrans CD primitive"
    );
}

#[test]
fn dispatch_autoinstinct_learning_routes() {
    let mut input = minimal_input();
    // 3 goals, no initial facts → planner flips 3 bits to reach goal
    input.goals = vec![
        Goal {
            id: "g0".into(),
            predicate: "achieve".into(),
            value: "sub-goal-0".into(),
        },
        Goal {
            id: "g1".into(),
            predicate: "achieve".into(),
            value: "sub-goal-1".into(),
        },
        Goal {
            id: "g2".into(),
            predicate: "achieve".into(),
            value: "sub-goal-2".into(),
        },
    ];
    input.facts = vec![];
    let output = dispatch_breed_test("autoinstinct_learning", &input)
        .expect("autoinstinct_learning dispatch failed");

    assert_eq!(
        output.breed,
        BreedId::AutoinstinctLearning,
        "breed mismatch"
    );
    assert!(
        !output.inference_trace.is_empty(),
        "autoinstinct_learning must produce non-empty trace"
    );
    assert!(
        output
            .selected
            .as_deref()
            .map(|s| s.contains("steps to goal"))
            .unwrap_or(false),
        "selected must describe steps to goal"
    );
}

#[test]
fn dispatch_unknown_breed_rejects() {
    let input = minimal_input();
    let result = dispatch_breed_test("unknown-breed", &input);

    assert!(result.is_err(), "unknown breed must be rejected");
    assert!(
        result.unwrap_err().contains("unknown breed"),
        "error message must mention unknown breed"
    );
}

#[test]
fn dispatch_empty_breed_rejects() {
    let input = minimal_input();
    let result = dispatch_breed_test("", &input);

    assert!(result.is_err(), "empty breed must be rejected");
}

#[test]
fn multi_breed_pipeline_smoke_test() {
    // Diagram 29: Execute all 9 breeds in sequence with appropriate inputs
    // This is a smoke test to verify all breeds execute without panic

    let breeds = vec![
        "eliza", "cbr", "dendral", "strips", "prolog", "mycin", "gps", "soar", "hearsay",
    ];
    let mut all_outputs = vec![];

    for breed_name in breeds {
        // Prepare breed-specific inputs with required data
        let input_for_breed = match breed_name {
            "cbr" => input_with_cases(),
            "mycin" => input_with_evidence(),
            "strips" | "gps" => input_with_reachable_goals(),
            _ => minimal_input(),
        };

        let output = dispatch_breed_test(breed_name, &input_for_breed)
            .unwrap_or_else(|e| panic!("breed {} execution failed: {}", breed_name, e));

        // Verify breed produced trace and explanation
        assert!(
            !output.inference_trace.is_empty(),
            "breed {} must produce non-empty trace",
            breed_name
        );

        assert!(
            !output.explanation.is_empty(),
            "breed {} must produce non-empty explanation",
            breed_name
        );

        all_outputs.push(output);
    }

    // Final verification: all 9 breeds executed successfully
    assert_eq!(all_outputs.len(), 9, "pipeline must execute all 9 breeds");

    // Verify outputs are properly structured
    for (idx, output) in all_outputs.iter().enumerate() {
        assert!(
            !output.explanation.is_empty(),
            "output[{}] has empty explanation",
            idx
        );
        assert!(
            !output.inference_trace.is_empty(),
            "output[{}] has empty trace",
            idx
        );
        assert!(
            output
                .inference_trace
                .iter()
                .map(|s| s.step)
                .max()
                .unwrap_or(0)
                > 0
                || output.inference_trace.len() == 1,
            "output[{}] has invalid trace indices",
            idx
        );
    }
}

#[test]
fn trace_step_index_monotonicity() {
    // Verify that inference trace steps have monotonically increasing indices
    let input = minimal_input();
    let output = dispatch_breed_test("eliza", &input).expect("eliza dispatch failed");

    let mut prev_step: usize = 0;
    for trace_step in &output.inference_trace {
        assert!(
            trace_step.step >= prev_step,
            "trace steps must be monotonically increasing"
        );
        prev_step = trace_step.step;
    }
}

#[test]
fn trace_step_kind_non_empty() {
    // Verify that all trace steps have non-empty kinds
    let input = minimal_input();
    let output = dispatch_breed_test("dendral", &input).expect("dendral dispatch failed");

    for trace_step in &output.inference_trace {
        assert!(
            !trace_step.kind.is_empty(),
            "trace step kind must not be empty"
        );
        assert!(
            !trace_step.detail.is_empty(),
            "trace step detail must not be empty"
        );
    }
}

#[test]
fn dispatch_preserves_input_candidates() {
    // Verify that dispatch preserves or updates candidate structure
    let input = minimal_input();
    let output = dispatch_breed_test("cbr", &input).expect("cbr dispatch failed");

    // Output candidates should be non-empty (CBR returns candidates)
    assert!(
        !output.candidates.is_empty(),
        "cbr must return candidate set"
    );

    // Verify candidate structure integrity
    for candidate in &output.candidates {
        assert!(!candidate.id.is_empty(), "candidate id must not be empty");
        assert!(
            candidate.score >= 0.0 && candidate.score <= 1.0,
            "candidate score must be in [0,1]"
        );
    }
}

#[test]
fn dispatch_output_receipt_consistency() {
    // Verify BLAKE3 receipt consistency across dispatch
    let input = minimal_input();
    let output = dispatch_breed_test("prolog", &input).expect("prolog dispatch failed");

    // Verify breed ID is correctly set
    assert_eq!(output.breed, BreedId::Prolog);

    // Verify output is serializable (receipt computation requires this)
    let output_json = serde_json::to_string(&output).expect("output must be JSON serializable");
    assert!(!output_json.is_empty(), "output JSON must not be empty");

    // Verify input is serializable
    let input_json = serde_json::to_string(&input).expect("input must be JSON serializable");
    assert!(!input_json.is_empty(), "input JSON must not be empty");
}

// ===========================================================================
// P3 tier dispatch smoke: every new breed routes and produces a non-empty
// trace plus a refusal for unknown routing typos.
// ===========================================================================

fn p3f(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

/// Valid representative input per P3 breed.
fn p3_input(breed: &str) -> BreedInput {
    let mut input = BreedInput {
        intent: format!("p3 {} exercise", breed),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    match breed {
        "situation_calculus" => {
            input.facts = vec![
                p3f("fluent:door_open", "true"),
                p3f("fluent:mark_set", "true"),
                p3f("action:shut:pre", "door_open"),
                p3f("action:shut:del", "door_open"),
                p3f("action:shut:add", "door_shut"),
                p3f("do:0", "shut"),
            ];
        }
        "circumscription" => {
            input.facts = vec![p3f("bird_pip", "true"), p3f("ostrich_pip", "true")];
            input.rules = vec![
                Rule { id: "r1".into(), premise: vec!["bird_pip".into(), "not_ab_pip".into()], conclusion: "flies_pip".into(), certainty: 1.0 },
                Rule { id: "r2".into(), premise: vec!["ostrich_pip".into()], conclusion: "ab_pip".into(), certainty: 1.0 },
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "entail".into(), value: "flies_pip".into() }];
        }
        "analogy_sme" => {
            input.facts = vec![
                p3f("base:0", "(cause (heat stove pot) (boil pot))"),
                p3f("target:0", "(cause (heat sun lake) (boil lake))"),
            ];
        }
        "act_r" => {
            input.facts = vec![p3f("goal", "lookup")];
            input.cases = vec![Case {
                id: "chunk-1".into(), intent: "x".into(), architecture: "chunk".into(),
                outcome_score: 0.7, facts: vec![p3f("slot", "val")],
            }];
            input.rules = vec![Rule { id: "p1".into(), premise: vec!["goal=lookup".into()], conclusion: "retrieve:slot=val".into(), certainty: 0.9 }];
        }
        "problog" => {
            input.facts = vec![p3f("pfact:burglary", "0.1"), p3f("pfact:quake", "0.2")];
            input.rules = vec![
                Rule { id: "r1".into(), premise: vec!["burglary".into()], conclusion: "alarm".into(), certainty: 1.0 },
                Rule { id: "r2".into(), premise: vec!["quake".into()], conclusion: "alarm".into(), certainty: 1.0 },
            ];
            input.goals = vec![Goal { id: "g1".into(), predicate: "query".into(), value: "alarm".into() }];
        }
        "sat_cdcl" => {
            input.facts = vec![
                p3f("clause:00", "1 2"),
                p3f("clause:01", "-1 2"),
                p3f("clause:02", "1 -2"),
                p3f("clause:03", "-1 -2"),
            ];
        }
        "episodic_memory" => {
            input.facts = vec![
                p3f("scene", "garden"),
                p3f("cue:t", "7"),
                p3f("episode:ep-a:t", "6"),
                p3f("episode:ep-b:t", "1"),
            ];
            input.cases = vec![
                Case { id: "ep-a".into(), intent: "x".into(), architecture: "episode".into(), outcome_score: 0.5, facts: vec![p3f("scene", "garden")] },
                Case { id: "ep-b".into(), intent: "x".into(), architecture: "episode".into(), outcome_score: 0.5, facts: vec![p3f("scene", "garden")] },
            ];
        }
        "rl_symbolic" => {
            input.facts = vec![
                p3f("mdp:gamma", "0.9"),
                p3f("mdp:start", "s0"),
                p3f("mdp:terminal:goal", "true"),
                p3f("mdp:t:s0:go", "goal"),
                p3f("mdp:t:s0:stay", "s0"),
                p3f("mdp:r:s0:go", "1.0"),
                p3f("rl:episodes", "50"),
            ];
        }
        "ctl_check" => {
            input.facts = vec![
                p3f("ts:init", "a"),
                p3f("ts:edge:a", "b"),
                p3f("ts:edge:b", "a"),
                p3f("ts:label:b", "p"),
                p3f("ctl:formula", "A F p"),
            ];
        }
        "ilp" => {
            input.facts = vec![
                p3f("bg:parent(ann,mary)", "true"),
                p3f("bg:parent(ann,tom)", "true"),
                p3f("bg:female(mary)", "true"),
                p3f("pos:daughter(mary,ann)", "true"),
                p3f("neg:daughter(tom,ann)", "true"),
            ];
        }
        "naive_physics" => {
            input.facts = vec![
                p3f("np:ground:floor", "true"),
                p3f("np:on:box", "floor"),
                p3f("np:on:vase", "box"),
                p3f("np:remove:box", "true"),
            ];
        }
        other => panic!("unknown p3 breed {}", other),
    }
    input
}

const P3_BREEDS: [&str; 11] = [
    "situation_calculus", "circumscription", "analogy_sme", "act_r", "problog",
    "sat_cdcl", "episodic_memory", "rl_symbolic", "ctl_check", "ilp", "naive_physics",
];

#[test]
fn p3_breeds_dispatch_smoke() {
    for breed in P3_BREEDS {
        let input = p3_input(breed);
        let out = dispatch_breed_test(breed, &input)
            .unwrap_or_else(|e| panic!("{} failed to dispatch: {}", breed, e));
        assert_eq!(format!("{}", out.breed), breed, "breed id echo");
        assert!(!out.inference_trace.is_empty(), "{}: empty trace (FM-5)", breed);
        assert!(
            out.inference_trace.iter().any(|t| t.kind == "decision"),
            "{}: missing decision step",
            breed
        );
    }
}

#[test]
fn p3_unknown_breed_still_refused() {
    let input = p3_input("problog");
    assert!(dispatch_breed_test("problogg", &input).is_err());
}
