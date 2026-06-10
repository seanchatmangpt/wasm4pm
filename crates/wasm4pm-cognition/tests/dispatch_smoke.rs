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
// P2 tier — dispatch smoke (12 breeds): each id routes through both
// dispatch_breed_test (raw) and dispatch::dispatch_breed (full lifecycle)
// and produces a non-empty inference trace.
// ===========================================================================

fn p2_smoke_inputs() -> Vec<(&'static str, BreedInput)> {
    let f = |key: &str, value: &str| Fact {
        key: key.into(),
        value: value.into(),
    };
    let base = || BreedInput {
        intent: "smoke".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let mut asp = base();
    asp.rules = vec![Rule {
        id: "s1".into(),
        premise: vec![],
        conclusion: "p".into(),
        certainty: 1.0,
    }];

    let mut dl = base();
    dl.facts = vec![f("dl:subclass:A", "B")];
    dl.goals = vec![Goal {
        id: "q".into(),
        predicate: "dl:subsumes".into(),
        value: "A:B".into(),
    }];

    let mut alp = base();
    alp.facts = vec![f("alp:abducible:a", "true")];
    alp.rules = vec![Rule {
        id: "s".into(),
        premise: vec!["a".into()],
        conclusion: "o".into(),
        certainty: 1.0,
    }];
    alp.goals = vec![Goal {
        id: "o".into(),
        predicate: "alp:observe".into(),
        value: "o".into(),
    }];

    let mut ibe = base();
    ibe.facts = vec![
        f("ibe:obs:o1", "true"),
        f("ibe:hyp:h1:covers", "o1"),
        f("ibe:hyp:h1:cost", "1"),
    ];

    let mut pop = base();
    pop.facts = vec![f("pop:op:act:add", "g")];
    pop.goals = vec![Goal {
        id: "g".into(),
        predicate: "g".into(),
        value: "true".into(),
    }];

    let mut ec = base();
    ec.facts = vec![f("ec:happens:1", "go"), f("ec:initiates:go", "m")];
    ec.goals = vec![Goal {
        id: "q".into(),
        predicate: "ec:holdsat".into(),
        value: "m@2".into(),
    }];

    let mut mdp = base();
    mdp.facts = vec![
        f("mdp:gamma", "0.5"),
        f("mdp:trans:s:a", "s:1.0"),
        f("mdp:reward:s:a", "1.0"),
    ];

    let mut vs = base();
    vs.facts = vec![f("vs:attrs", "a"), f("vs:example:1", "x:+")];

    let mut bm = base();
    bm.facts = vec![f("bm:atoms", "a"), f("bm:base:1", "a"), f("bm:base:2", "-a")];

    let mut qr = base();
    qr.facts = vec![f("qr:confluence:c1", "+x,-y"), f("qr:sign:x", "+")];

    let mut sam = base();
    sam.facts = vec![f("sam:event:1", "enter:bo"), f("sam:event:2", "leave:bo")];

    let mut clp = base();
    clp.facts = vec![f("clp:var:x", "1..2"), f("clp:constraint:c1", "x<=1")];

    vec![
        ("asp", asp),
        ("description_logic", dl),
        ("abductive_lp", alp),
        ("abductive_ibe", ibe),
        ("partial_order_plan", pop),
        ("event_calculus", ec),
        ("mdp", mdp),
        ("version_space", vs),
        ("belief_merging", bm),
        ("qualitative_reason", qr),
        ("script_sam", sam),
        ("clp", clp),
    ]
}

#[test]
fn p2_breeds_route_through_raw_dispatch() {
    for (breed, input) in p2_smoke_inputs() {
        let out = dispatch_breed_test(breed, &input)
            .unwrap_or_else(|e| panic!("{} raw dispatch: {}", breed, e));
        assert!(
            !out.inference_trace.is_empty(),
            "{}: non-empty trace required",
            breed
        );
        assert_eq!(format!("{}", out.breed), breed, "{}: breed id mismatch", breed);
    }
}

#[test]
fn p2_breeds_route_through_full_dispatch_with_ocel_gate() {
    for (breed, input) in p2_smoke_inputs() {
        let out = wasm4pm_cognition::breeds::dispatch::dispatch_breed(breed, &input)
            .unwrap_or_else(|e| panic!("{} full dispatch: {}", breed, e));
        assert!(out.ocel_log.is_some(), "{}: OCEL log must be attached", breed);
    }
}

#[test]
fn p2_unknown_breed_still_rejected() {
    let (_, input) = &p2_smoke_inputs()[0];
    assert!(dispatch_breed_test("florbulator", input).is_err());
}
