//! OCEL 2.0 conformance tests — van der Aalst doctrine.
//!
//! Every breed execution must produce an object-centric event log that conforms
//! to its declared lifecycle model. Non-conforming execution is detected.

use std::collections::BTreeMap;
use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedId, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
    TraceStep,
};
use wasm4pm_cognition::ocel::{
    check_temporal_conformance, derive_ocel, get_model, validate_ocel_alignment, OcelEvent, OcelLog,
};

// ── helpers ──────────────────────────────────────────────────────────────────

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

fn input_with_cases() -> BreedInput {
    let mut input = minimal_input();
    input.cases = vec![Case {
        id: "case-1".into(),
        intent: "similar intent".into(),
        architecture: "architecture-A".into(),
        outcome_score: 0.9,
        facts: vec![Fact {
            key: "test:fact".into(),
            value: "test-value".into(),
        }],
    }];
    input
}

fn input_with_reachable_goals() -> BreedInput {
    let mut input = minimal_input();
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

fn make_trace_step(step: usize, kind: &str, detail: &str) -> TraceStep {
    TraceStep {
        step,
        kind: kind.to_string(),
        detail: detail.to_string(),
        depth: 0,
        objects: vec![],
    }
}

// ── negative tests ────────────────────────────────────────────────────────────

#[test]
fn mycin_missing_fire_rule_fails_conformance() {
    // MYCIN lifecycle requires fire-rule+ — omitting all fire-rule events → fitness < 1.0
    let steps = vec![
        make_trace_step(0, "load-fact", "fact:offline"),
        // No fire-rule events!
        make_trace_step(1, "decision", "mycin:selected"),
    ];
    let log = derive_ocel("mycin", "test-run-id-12345678", &steps);
    let model = get_model("mycin").expect("mycin model must exist");
    let result = validate_ocel_alignment(&log, model);
    assert!(
        result.fitness < 1.0,
        "Expected fitness < 1.0 for missing fire-rule phase, got {}",
        result.fitness
    );
    assert!(!result.is_conforming, "Should not be conforming");
    assert!(
        result.refusals.iter().any(|r| r.contains("fire-rules")),
        "Expected refusal mentioning 'fire-rules', got: {:?}",
        result.refusals
    );
}

#[test]
fn non_monotonic_logical_step_fails_temporal_conformance() {
    // Manually construct a log with non-monotonic logical_step
    let mut attrs1 = BTreeMap::new();
    attrs1.insert("logical_step".to_string(), serde_json::json!(5u64));
    let mut attrs2 = BTreeMap::new();
    attrs2.insert("logical_step".to_string(), serde_json::json!(3u64)); // goes backward!

    let log = OcelLog {
        object_types: vec!["run".to_string()],
        event_types: vec!["fire-rule".to_string()],
        objects: vec![],
        events: vec![
            OcelEvent {
                event_id: "e1".to_string(),
                activity: "fire-rule".to_string(),
                timestamp: "1970-01-01T00:00:00Z".to_string(),
                attributes: attrs1,
                o2o: vec![],
            },
            OcelEvent {
                event_id: "e2".to_string(),
                activity: "fire-rule".to_string(),
                timestamp: "1970-01-01T00:00:00Z".to_string(),
                attributes: attrs2,
                o2o: vec![],
            },
        ],
    };

    let result = check_temporal_conformance(&log);
    assert!(
        result.is_err(),
        "Non-monotonic logical_step should fail temporal conformance"
    );
    assert!(
        result.unwrap_err().contains("non-monotonic"),
        "Error should mention 'non-monotonic'"
    );
}

// ── positive tests ────────────────────────────────────────────────────────────

#[test]
fn valid_mycin_trace_fitness_one() {
    let steps = vec![
        make_trace_step(0, "load-fact", "fact:offline"),
        make_trace_step(1, "fire-rule", "rule-1"),
        make_trace_step(2, "fire-rule", "rule-2"),
        make_trace_step(3, "decision", "mycin:selected"),
    ];
    let log = derive_ocel("mycin", "test-run-id-12345678", &steps);
    let model = get_model("mycin").expect("mycin model must exist");
    let result = validate_ocel_alignment(&log, model);
    assert_eq!(
        result.fitness, 1.0,
        "Valid MYCIN trace must have fitness=1.0, got {}. Refusals: {:?}",
        result.fitness, result.refusals
    );
    assert!(result.is_conforming, "Should be conforming");
    assert!(
        result.refusals.is_empty(),
        "Should have no refusals: {:?}",
        result.refusals
    );
}

#[test]
fn ocel_log_has_constant_epoch_timestamps() {
    let steps = vec![make_trace_step(0, "fire-rule", "rule-1")];
    let log = derive_ocel("mycin", "test-run-12345678", &steps);
    for event in &log.events {
        assert_eq!(
            event.timestamp, "1970-01-01T00:00:00Z",
            "All timestamps must be constant epoch, found: {}",
            event.timestamp
        );
    }
}

#[test]
fn ocel_log_has_run_start_and_end() {
    let steps = vec![make_trace_step(0, "fire-rule", "rule-1")];
    let log = derive_ocel("mycin", "test-run-12345678", &steps);
    assert!(
        log.events.iter().any(|e| e.activity == "run-start"),
        "Must have run-start event"
    );
    assert!(
        log.events.iter().any(|e| e.activity == "run-end"),
        "Must have run-end event"
    );
}

#[test]
fn ocel_log_logical_steps_monotone() {
    let steps: Vec<TraceStep> = (0..5)
        .map(|i| make_trace_step(i, "fire-rule", "r"))
        .collect();
    let log = derive_ocel("mycin", "test-run-12345678", &steps);
    check_temporal_conformance(&log).expect("Derived OCEL log must have monotone logical_steps");
}

// ── all 13 breeds must produce fitness==1.0 ──────────────────────────────────

fn assert_breed_conforming(breed: &str, input: &BreedInput) {
    let output = dispatch_breed_test(breed, input)
        .unwrap_or_else(|e| panic!("{} dispatch failed: {}", breed, e));

    assert!(
        !output.inference_trace.is_empty(),
        "{}: inference_trace must not be empty",
        breed
    );

    let trace_str = serde_json::to_string(&output.inference_trace).unwrap_or_default();
    let run_id = blake3::hash(trace_str.as_bytes()).to_hex().to_string();
    let ocel_log = derive_ocel(breed, &run_id, &output.inference_trace);

    // Temporal conformance
    check_temporal_conformance(&ocel_log)
        .unwrap_or_else(|e| panic!("{}: temporal conformance failed: {}", breed, e));

    // Lifecycle conformance (only for breeds with declared models)
    if let Some(model) = get_model(breed) {
        let result = validate_ocel_alignment(&ocel_log, model);
        assert_eq!(
            result.fitness,
            1.0,
            "{}: expected fitness=1.0, got {}. Refusals: {:?}\nTrace kinds: {:?}",
            breed,
            result.fitness,
            result.refusals,
            output
                .inference_trace
                .iter()
                .map(|s| &s.kind)
                .collect::<Vec<_>>()
        );
        assert!(result.is_conforming, "{}: must be conforming", breed);
    }
}

#[test]
fn all_13_breeds_ocel_conforming() {
    let base_input = minimal_input();
    let cbr_input = input_with_cases();

    let reachable_input = input_with_reachable_goals();
    let evidence_input = input_with_evidence();

    // Breeds that use base input
    for breed in &[
        "eliza",
        "dendral",
        "prolog",
        "soar",
        "hearsay",
        "autoinstinct_neurosis",
        "autoinstinct_semantics",
        "autoinstinct_vision",
        "autoinstinct_learning",
    ] {
        assert_breed_conforming(breed, &base_input);
    }

    // MYCIN needs evidence facts
    assert_breed_conforming("mycin", &evidence_input);

    // STRIPS and GPS need a reachable goal
    assert_breed_conforming("strips", &reachable_input);
    assert_breed_conforming("gps", &reachable_input);

    // CBR needs cases
    assert_breed_conforming("cbr", &cbr_input);
}

// ===========================================================================
// P1 TIER — measured OCEL fitness 1.0 per breed (van der Aalst doctrine)
// ===========================================================================

/// Run a P1 breed end-to-end, derive its OCEL log, replay it against the
/// declared lifecycle model, and assert MEASURED fitness == 1.0. These tests
/// are the evidence backing `ocel/reports/<breed>.json`.
fn assert_p1_fitness_one(breed: &str, input: &BreedInput) {
    let out = dispatch_breed_test(breed, input)
        .unwrap_or_else(|e| panic!("{} dispatch failed: {}", breed, e));
    let log = derive_ocel(breed, "fitness-run", &out.inference_trace);
    let model = wasm4pm_cognition::ocel::lifecycle_model_for(breed)
        .unwrap_or_else(|| panic!("{} has no lifecycle model", breed));
    let result = validate_ocel_alignment(&log, model);
    assert!(
        result.is_conforming && (result.fitness - 1.0).abs() < f32::EPSILON,
        "{} measured fitness must be 1.0, got {} (refusals: {:?})",
        breed,
        result.fitness,
        result.refusals
    );
}

fn p1_fact(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

fn p1_rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

#[test]
fn ltl_monitor_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("ltl:formula", "G (red -> !green)"),
        p1_fact("trace:0", "red"),
        p1_fact("trace:1", "green"),
    ];
    assert_p1_fitness_one("ltl_monitor", &input);
}

#[test]
fn allen_temporal_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("relation", "gamma,delta,p"),
        p1_fact("relation", "delta,eps,m"),
    ];
    assert_p1_fitness_one("allen_temporal", &input);
}

#[test]
fn fuzzy_logic_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("fuzzy:zlorp:mid", "tri:2,5,8"),
        p1_fact("fuzzy:gwib:out", "tri:0,50,100"),
        p1_fact("fuzzy:input:zlorp", "3.7"),
    ];
    input.rules = vec![p1_rule("r1", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0)];
    assert_p1_fitness_one("fuzzy_logic", &input);
}

#[test]
fn bayesian_network_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("cpt:Q", "0.3"),
        p1_fact("cpt:R|Q", "0.2,0.8"),
        p1_fact("cpt:S|R", "0.1,0.7"),
        p1_fact("evidence:Q", "true"),
    ];
    input.goals = vec![Goal { id: "g1".into(), predicate: "query".into(), value: "prob:S".into() }];
    assert_p1_fitness_one("bayesian_network", &input);
}

#[test]
fn csp_ac3_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("csp-var", "V1:B,G,R"),
        p1_fact("csp-var", "V2:B,G,R"),
        p1_fact("csp-var", "V3:B,G,R"),
        p1_fact("csp-constraint", "V1!=V2"),
        p1_fact("csp-constraint", "V2!=V3"),
        p1_fact("csp-constraint", "V1!=V3"),
    ];
    assert_p1_fitness_one("csp_ac3", &input);
}

#[test]
fn default_logic_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![p1_fact("obs:tweety", "penguin")];
    input.rules = vec![
        p1_rule("r_isa", vec!["penguin"], "bird", 1.0),
        p1_rule("r_penguin", vec!["penguin"], "not_flies", 1.0),
        p1_rule("r_birds_fly", vec!["bird", "unless:not_flies"], "flies", 0.9),
    ];
    assert_p1_fitness_one("default_logic", &input);
}

#[test]
fn htn_planning_fitness_one() {
    let mut input = minimal_input();
    input.state = vec![
        StateAtom { predicate: "pkg".into(), value: "at_depot".into() },
        StateAtom { predicate: "truck".into(), value: "at_depot".into() },
    ];
    input.goals = vec![Goal { id: "g1".into(), predicate: "task".into(), value: "deliver".into() }];
    input.rules = vec![
        p1_rule("method:deliver:by_truck", vec!["pkg=at_depot"], "op:load;op:drive;op:unload", 1.0),
        p1_rule("op:load", vec!["pkg=at_depot", "truck=at_depot"], "!pkg=at_depot;pkg=in_truck", 1.0),
        p1_rule("op:drive", vec!["truck=at_depot"], "!truck=at_depot;truck=at_dest", 1.0),
        p1_rule("op:unload", vec!["pkg=in_truck", "truck=at_dest"], "!pkg=in_truck;pkg=at_dest", 1.0),
    ];
    assert_p1_fitness_one("htn_planning", &input);
}

#[test]
fn dempster_shafer_fitness_one() {
    let mut input = minimal_input();
    input.rules = vec![
        p1_rule("witnessA", vec![], "flim", 0.5),
        p1_rule("witnessB", vec![], "flam", 0.75),
    ];
    input.goals = vec![Goal { id: "query".into(), predicate: "query".into(), value: "flim".into() }];
    assert_p1_fitness_one("dempster_shafer", &input);
}

#[test]
fn frames_inheritance_fitness_one() {
    let mut input = minimal_input();
    input.intent = "resolve zilk color".into();
    input.facts = vec![
        p1_fact("frame:zilk:isa", "welp"),
        p1_fact("frame:welp:slot:color", "red"),
    ];
    assert_p1_fitness_one("frames_inheritance", &input);
}

#[test]
fn ebl_fitness_one() {
    let mut input = minimal_input();
    input.facts = vec![
        p1_fact("weight(krate1,light)", "true"),
        p1_fact("weight(bench1,heavy)", "true"),
    ];
    input.rules = vec![
        p1_rule("r1", vec!["lighter(?x,?y)"], "safe_to_stack(?x,?y)", 1.0),
        p1_rule("r2", vec!["weight(?x,light)", "weight(?y,heavy)"], "lighter(?x,?y)", 1.0),
    ];
    input.goals = vec![Goal {
        id: "g1".into(),
        predicate: "safe_to_stack(krate1,bench1)".into(),
        value: "true".into(),
    }];
    assert_p1_fitness_one("ebl", &input);
}

/// Negative injection (van der Aalst constitution): a trace with its init
/// step removed must NOT achieve fitness 1.0.
#[test]
fn ltl_monitor_shuffled_trace_not_conforming() {
    let steps = vec![
        make_trace_step(0, "ltl-progress", "trace:0"),
        make_trace_step(1, "ltl-verdict", "true"),
    ];
    let log = derive_ocel("ltl_monitor", "neg-run", &steps);
    let model = wasm4pm_cognition::ocel::lifecycle_model_for("ltl_monitor").unwrap();
    let result = validate_ocel_alignment(&log, model);
    assert!(!result.is_conforming, "missing ltl-init must break conformance");
    assert!(result.fitness < 1.0);
}

/// Negative injection: an out-of-order trace (verdict before progress) must
/// be rejected by the lifecycle DFA.
#[test]
fn csp_verdict_before_init_not_conforming() {
    let steps = vec![
        make_trace_step(0, "csp-verdict", "satisfiable=true"),
        make_trace_step(1, "csp-init", "vars=2"),
    ];
    let log = derive_ocel("csp_ac3", "neg-run", &steps);
    let model = wasm4pm_cognition::ocel::lifecycle_model_for("csp_ac3").unwrap();
    let result = validate_ocel_alignment(&log, model);
    assert!(!result.is_conforming, "verdict-before-init must break conformance");
}
