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
    check_temporal_conformance, derive_ocel, lifecycle_model_for, validate_ocel_alignment, OcelEvent, OcelLog,
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
    let model = lifecycle_model_for("mycin").expect("mycin model must exist");
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
    let model = lifecycle_model_for("mycin").expect("mycin model must exist");
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

use rand::seq::SliceRandom;
use rand::{SeedableRng, rngs::SmallRng};

fn assert_breed_conforming(breed: &str) {
    let fixture_path = format!("tests/fixtures/papers/{}.json", breed);
    let fixture_data = std::fs::read_to_string(&fixture_path)
        .unwrap_or_else(|_| panic!("Failed to read fixture: {}", fixture_path));
    
    let fixture: serde_json::Value = serde_json::from_str(&fixture_data).unwrap();
    let input: BreedInput = if fixture.get("input").is_some() {
        serde_json::from_value(fixture["input"].clone()).unwrap()
    } else {
        serde_json::from_value(fixture).unwrap()
    };

    let output = dispatch_breed_test(breed, &input)
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
        .unwrap_or_else(|e| panic!("{}: Temporal conformance failed: {}", breed, e));

    // Lifecycle conformance
    if let Some(model) = lifecycle_model_for(breed) {
        let result = validate_ocel_alignment(&ocel_log, model);

        assert!(
            result.is_conforming,
            "{}: should be conforming but refused: {:?}",
            breed, result.refusals
        );
        assert_eq!(result.fitness, 1.0, "{}: fitness should be 1.0", breed);

        // Negative injection: shuffle the trace and ensure it's not 1.0 conforming
        if output.inference_trace.len() > 1 {
            let mut shuffled_trace = output.inference_trace.clone();
            let mut rng = SmallRng::seed_from_u64(42);
            shuffled_trace.shuffle(&mut rng);
            
            let shuffled_log = derive_ocel(breed, &run_id, &shuffled_trace);
            let shuffled_result = validate_ocel_alignment(&shuffled_log, model);
            
            // Either temporal fails, or fitness is < 1.0, or refusals exist
            let temporal_ok = check_temporal_conformance(&shuffled_log).is_ok();
            assert!(
                !temporal_ok || !shuffled_result.is_conforming || shuffled_result.fitness < 1.0,
                "{}: Shuffled trace must not have 1.0 fitness and be conforming", breed
            );
        }
    }
}

#[test]
fn all_admitted_breeds_ocel_conforming() {
    let registry_data = std::fs::read_to_string("breeds/registry.json")
        .expect("failed to read registry.json");
    let registry: Vec<serde_json::Value> = serde_json::from_str(&registry_data)
        .expect("failed to parse registry.json");

    for entry in registry {
        let breed_id = entry["breed_id"].as_str().expect("missing breed_id");
        let status = entry["status"].as_str().expect("missing status");

        if status != "UNSUPPORTED" {
            assert_breed_conforming(breed_id);
        }
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
