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
// P2 tier — OCEL conformance: measured fitness 1.0 per breed on its paper
// fixture input, plus negative injection (shuffled trace must not be 1.0).
// ===========================================================================

mod p2_conformance {
    use super::*;
    use std::fs;
    use wasm4pm_cognition::breeds::BreedInput;
    use wasm4pm_cognition::ocel::lifecycle_model_for;

    const P2_BREEDS: [&str; 12] = [
        "asp",
        "description_logic",
        "abductive_lp",
        "abductive_ibe",
        "partial_order_plan",
        "event_calculus",
        "mdp",
        "version_space",
        "belief_merging",
        "qualitative_reason",
        "script_sam",
        "clp",
    ];

    fn fixture_input(breed: &str) -> BreedInput {
        let path = format!("tests/fixtures/papers/{}.json", breed);
        let content = fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {}", path, e));
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();
        serde_json::from_value(json["input"].clone())
            .unwrap_or_else(|e| panic!("{} input: {}", path, e))
    }

    /// Measured fitness must be exactly 1.0 for every P2 breed.
    #[test]
    fn p2_fitness_is_one_for_every_breed() {
        for breed in P2_BREEDS {
            let input = fixture_input(breed);
            let out = dispatch_breed_test(breed, &input)
                .unwrap_or_else(|e| panic!("{}: {}", breed, e));
            let log = derive_ocel(breed, "p2conformance", &out.inference_trace);
            let model = lifecycle_model_for(breed)
                .unwrap_or_else(|| panic!("{}: missing lifecycle model", breed));
            let result = validate_ocel_alignment(&log, model);
            assert!(
                result.is_conforming && (result.fitness - 1.0).abs() < f32::EPSILON,
                "{}: fitness {} refusals {:?}",
                breed,
                result.fitness,
                result.refusals
            );
        }
    }

    /// Negative injection: reversing a real trace must break conformance
    /// (van der Aalst doctrine — the model must reject impossible logs).
    #[test]
    fn p2_shuffled_trace_is_rejected() {
        let input = fixture_input("asp");
        let out = dispatch_breed_test("asp", &input).unwrap();
        let mut steps = out.inference_trace.clone();
        steps.reverse();
        for (i, s) in steps.iter_mut().enumerate() {
            s.step = i; // keep logical steps monotonic so ONLY ordering is wrong
        }
        let log = derive_ocel("asp", "p2negative", &steps);
        let model = lifecycle_model_for("asp").unwrap();
        let result = validate_ocel_alignment(&log, model);
        assert!(
            !result.is_conforming,
            "reversed ASP trace must not conform (fitness {})",
            result.fitness
        );
    }

    /// Every P2 breed has both a lifecycle model and an OCPN model source.
    #[test]
    fn p2_models_registered() {
        for breed in P2_BREEDS {
            assert!(lifecycle_model_for(breed).is_some(), "{}: lifecycle", breed);
            let src = wasm4pm_cognition::ocel::model_sources::model_source(breed)
                .unwrap_or_else(|| panic!("{}: OCPN source", breed));
            let parsed: serde_json::Value = serde_json::from_str(src)
                .unwrap_or_else(|e| panic!("{}: OCPN parse {}", breed, e));
            assert_eq!(parsed["breed_id"].as_str(), Some(breed));
        }
    }
}

// ===========================================================================
// P3 tier OCEL conformance: every breed's derived log replays its declared
// lifecycle model at fitness 1.0; a shuffled trace must NOT conform.
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
fn p3_breeds_ocel_fitness_one() {
    for breed in P3_BREEDS {
        let input = p3_input(breed);
        let out = dispatch_breed_test(breed, &input)
            .unwrap_or_else(|e| panic!("{}: {}", breed, e));
        let log = derive_ocel(breed, "p3runfixture", &out.inference_trace);
        let model = wasm4pm_cognition::ocel::lifecycle_model_for(breed)
            .unwrap_or_else(|| panic!("{}: lifecycle model missing", breed));
        let result = validate_ocel_alignment(&log, model);
        assert!(
            result.is_conforming && (result.fitness - 1.0).abs() < f32::EPSILON,
            "{}: fitness {} refusals {:?}",
            breed,
            result.fitness,
            result.refusals
        );
    }
}

/// Van der Aalst negative injection: a reversed trace must not replay at 1.0.
#[test]
fn p3_shuffled_trace_is_not_conforming() {
    let input = p3_input("situation_calculus");
    let out = dispatch_breed_test("situation_calculus", &input).expect("run ok");
    let mut steps = out.inference_trace.clone();
    steps.reverse();
    for (i, s) in steps.iter_mut().enumerate() {
        s.step = i; // keep logical steps monotonic so only ORDER is wrong
    }
    let log = derive_ocel("situation_calculus", "p3shuffled", &steps);
    let model = wasm4pm_cognition::ocel::lifecycle_model_for("situation_calculus").unwrap();
    let result = validate_ocel_alignment(&log, model);
    assert!(
        !result.is_conforming,
        "reversed lifecycle order must be rejected (fitness {})",
        result.fitness
    );
}

/// Every P3 breed has a hand-authored OCPN model source on disk.
#[test]
fn p3_breeds_have_model_sources() {
    for breed in P3_BREEDS {
        let src = wasm4pm_cognition::ocel::model_sources::model_source(breed)
            .unwrap_or_else(|| panic!("{}: OCPN model source missing", breed));
        let json: serde_json::Value = serde_json::from_str(src).expect("OCPN must be valid JSON");
        assert_eq!(json["breed_id"].as_str(), Some(breed));
        assert_eq!(json["model_level"].as_str(), Some("L1"));
        assert!(json["places"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
        assert!(json["transitions"].as_array().map(|a| !a.is_empty()).unwrap_or(false));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// P4 tier OCEL conformance: measured fitness must be exactly 1.0 per breed,
// and the full dispatch path (which embeds the conformance gate) must pass.
// ─────────────────────────────────────────────────────────────────────────────

fn p4c_fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

fn p4c_input(facts: Vec<Fact>) -> BreedInput {
    BreedInput {
        intent: "conformance".into(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn assert_p4_fitness_one(breed: &str, input: &BreedInput) {
    use wasm4pm_cognition::breeds::dispatch_breed;
    use wasm4pm_cognition::ocel::lifecycle_model_for;

    // Full gated path (refuses on non-conformance).
    let out = dispatch_breed(breed, input)
        .unwrap_or_else(|e| panic!("{} must pass the OCEL gate: {}", breed, e));
    assert!(out.ocel_log.is_some(), "{} must attach an OCEL log", breed);

    // Independent fitness measurement.
    let log = derive_ocel(breed, "fitness-check-run", &out.inference_trace);
    let model = lifecycle_model_for(breed).expect("lifecycle model registered");
    let result = validate_ocel_alignment(&log, model);
    assert_eq!(result.fitness, 1.0, "{} fitness: {:?}", breed, result.refusals);
    assert!(result.is_conforming);

    // Negative injection (van der Aalst constitution): a reversed trace must
    // NOT conform when the model has ordered phases.
    if out.inference_trace.len() > 2 {
        let mut shuffled = out.inference_trace.clone();
        shuffled.reverse();
        for (i, s) in shuffled.iter_mut().enumerate() {
            s.step = i;
        }
        let bad_log = derive_ocel(breed, "shuffled-run", &shuffled);
        let bad = validate_ocel_alignment(&bad_log, model);
        assert!(
            !bad.is_conforming,
            "{}: reversed trace must not conform",
            breed
        );
    }
}

#[test]
fn tableaux_ocel_fitness_one() {
    assert_p4_fitness_one(
        "tableaux",
        &p4c_input(vec![p4c_fact("tableaux:formula", "((a -> b) -> a) -> a")]),
    );
}

#[test]
fn construction_grammar_ocel_fitness_one() {
    assert_p4_fitness_one(
        "construction_grammar",
        &p4c_input(vec![
            p4c_fact("cxg:utterance", "he sneezed the napkin off the table"),
            p4c_fact("lex:he:pos", "pron"),
            p4c_fact("lex:sneezed:pos", "verb"),
            p4c_fact("lex:sneezed:valence", "intransitive"),
            p4c_fact("lex:the:pos", "det"),
            p4c_fact("lex:napkin:pos", "noun"),
            p4c_fact("lex:off:pos", "prep"),
            p4c_fact("lex:table:pos", "noun"),
        ]),
    );
}

#[test]
fn markov_logic_ocel_fitness_one() {
    assert_p4_fitness_one(
        "markov_logic",
        &p4c_input(vec![
            p4c_fact("mln:clause:c1", "1.5|!smokes_anna,cancer_anna"),
            p4c_fact("mln:clause:c2", "1.1|!friends_ab,!smokes_anna,smokes_bob"),
            p4c_fact("evidence:smokes_anna", "true"),
            p4c_fact("evidence:friends_ab", "true"),
        ]),
    );
}

#[test]
fn pomdp_ocel_fitness_one() {
    let mut facts = vec![
        p4c_fact("pomdp:states", "tiger-left,tiger-right"),
        p4c_fact("pomdp:actions", "listen,open-left,open-right"),
        p4c_fact("pomdp:observations", "hear-left,hear-right"),
        p4c_fact("pomdp:gamma", "0.95"),
        p4c_fact("pomdp:horizon", "3"),
        p4c_fact("pomdp:b0:tiger-left", "0.5"),
        p4c_fact("pomdp:b0:tiger-right", "0.5"),
        p4c_fact("pomdp:o:listen:tiger-left:hear-left", "0.85"),
        p4c_fact("pomdp:o:listen:tiger-left:hear-right", "0.15"),
        p4c_fact("pomdp:o:listen:tiger-right:hear-left", "0.15"),
        p4c_fact("pomdp:o:listen:tiger-right:hear-right", "0.85"),
        p4c_fact("pomdp:step:0", "listen|hear-left"),
    ];
    for s in ["tiger-left", "tiger-right"] {
        for sp in ["tiger-left", "tiger-right"] {
            facts.push(p4c_fact(
                &format!("pomdp:t:listen:{}:{}", s, sp),
                if s == sp { "1.0" } else { "0.0" },
            ));
        }
        facts.push(p4c_fact(&format!("pomdp:r:listen:{}", s), "-1.0"));
    }
    for a in ["open-left", "open-right"] {
        for s in ["tiger-left", "tiger-right"] {
            for sp in ["tiger-left", "tiger-right"] {
                facts.push(p4c_fact(&format!("pomdp:t:{}:{}:{}", a, s, sp), "0.5"));
            }
            for ob in ["hear-left", "hear-right"] {
                facts.push(p4c_fact(&format!("pomdp:o:{}:{}:{}", a, s, ob), "0.5"));
            }
        }
    }
    facts.push(p4c_fact("pomdp:r:open-left:tiger-left", "-100.0"));
    facts.push(p4c_fact("pomdp:r:open-left:tiger-right", "10.0"));
    facts.push(p4c_fact("pomdp:r:open-right:tiger-left", "10.0"));
    facts.push(p4c_fact("pomdp:r:open-right:tiger-right", "-100.0"));
    assert_p4_fitness_one("pomdp", &p4c_input(facts));
}

#[test]
fn contingent_plan_ocel_fitness_one() {
    assert_p4_fitness_one(
        "contingent_plan",
        &p4c_input(vec![
            p4c_fact("cp:unknown", "dirt"),
            p4c_fact("cp:goal:dirt", "false"),
            p4c_fact("cp:act:suck:pre", "dirt"),
            p4c_fact("cp:act:suck:del", "dirt"),
            p4c_fact("cp:sense:check-dirt", "dirt"),
        ]),
    );
}

#[test]
fn meta_reasoning_ocel_fitness_one() {
    assert_p4_fitness_one(
        "meta_reasoning",
        &p4c_input(vec![
            p4c_fact("breed:mycin:conclusion", "therapy=gentamicin"),
            p4c_fact("breed:mycin:confidence", "0.8"),
            p4c_fact("breed:prolog:conclusion", "therapy=none"),
            p4c_fact("breed:prolog:confidence", "0.6"),
        ]),
    );
}
