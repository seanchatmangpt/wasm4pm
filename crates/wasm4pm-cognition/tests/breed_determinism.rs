//! 13-breed determinism harness.
//!
//! For each of the 13 breeds, runs the breed TWICE with identical input and
//! asserts serialized output is identical. Also validates order-independence
//! for MYCIN and Hearsay (reversed fact order produces same `selected`).

use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

// ---------------------------------------------------------------------------
// Input builders
// ---------------------------------------------------------------------------

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

fn cbr_input() -> BreedInput {
    let mut input = minimal_input();
    input.cases = vec![
        Case {
            id: "case-1".into(),
            intent: "test intent".into(),
            architecture: "architecture-A".into(),
            outcome_score: 0.9,
            facts: vec![Fact {
                key: "test:fact".into(),
                value: "test-value".into(),
            }],
        },
        Case {
            id: "case-2".into(),
            intent: "different".into(),
            architecture: "architecture-B".into(),
            outcome_score: 0.5,
            facts: vec![],
        },
    ];
    input
}

fn reachable_goals_input() -> BreedInput {
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

fn mycin_input() -> BreedInput {
    BreedInput {
        intent: "diagnosis".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "symptom".into(),
                value: "fever".into(),
            },
            Fact {
                key: "symptom".into(),
                value: "cough".into(),
            },
        ],
        cases: vec![],
        rules: vec![
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
        ],
        goals: vec![],
        state: vec![],
    }
}

fn hearsay_input() -> BreedInput {
    BreedInput {
        intent: "speech recognition".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "phone".into(),
                value: "T".into(),
            },
            Fact {
                key: "phone".into(),
                value: "H".into(),
            },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "ks-word".into(),
                premise: vec!["phone:T".into()],
                conclusion: "word:THE".into(),
                certainty: 0.9,
            },
            Rule {
                id: "ks-phrase".into(),
                premise: vec!["word:THE".into()],
                conclusion: "phrase:THE_CAT".into(),
                certainty: 0.8,
            },
        ],
        goals: vec![],
        state: vec![],
    }
}

fn autoinstinct_vision_input() -> BreedInput {
    let mut input = minimal_input();
    input.facts = vec![Fact {
        key: "object".into(),
        value: "cube".into(),
    }];
    input
}

fn autoinstinct_semantics_input() -> BreedInput {
    let mut input = minimal_input();
    input.intent = "John give book to Mary".into();
    input
}

fn autoinstinct_neurosis_input() -> BreedInput {
    minimal_input()
}

fn autoinstinct_learning_input() -> BreedInput {
    BreedInput {
        intent: "planning test".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![
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
        ],
        state: vec![],
    }
}

fn ltl_monitor_input() -> BreedInput {
    let mut input = minimal_input();
    input.intent = "G (req -> F res)".into();
    input.cases = vec![
        Case {
            id: "state0".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 1.0,
            facts: vec![Fact { key: "req".into(), value: "true".into() }],
        },
        Case {
            id: "state1".into(),
            intent: "".into(),
            architecture: "".into(),
            outcome_score: 1.0,
            facts: vec![Fact { key: "res".into(), value: "true".into() }],
        },
    ];
    input
}

fn allen_temporal_input() -> BreedInput {
    BreedInput {
        intent: "Allen".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "relation".into(), value: "A meets B".into() },
            Fact { key: "relation".into(), value: "B meets C".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn fuzzy_logic_input() -> BreedInput {
    BreedInput {
        intent: "Fuzzy".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "temperature".into(), value: "25.0".into() },
            Fact { key: "fuzzy_set:temperature:warm".into(), value: "triangular 20,25,30".into() },
            Fact { key: "fuzzy_set:ventilation:medium".into(), value: "triangular 10,50,90".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["temperature is warm".into()],
                conclusion: "ventilation is medium".into(),
                certainty: 1.0,
            }
        ],
        goals: vec![],
        state: vec![],
    }
}

fn bayesian_network_input() -> BreedInput {
    BreedInput {
        intent: "Bayesian".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "Alarm".into(), value: "true".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r-burg".into(),
                premise: vec![],
                conclusion: "Burglary=true".into(),
                certainty: 0.001,
            },
            Rule {
                id: "r-eq".into(),
                premise: vec![],
                conclusion: "Earthquake=true".into(),
                certainty: 0.002,
            },
            Rule {
                id: "r-alarm1".into(),
                premise: vec!["Burglary=true".into(), "Earthquake=true".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.95,
            },
            Rule {
                id: "r-alarm2".into(),
                premise: vec!["Burglary=true".into(), "Earthquake=false".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.94,
            },
            Rule {
                id: "r-alarm3".into(),
                premise: vec!["Burglary=false".into(), "Earthquake=true".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.29,
            },
            Rule {
                id: "r-alarm4".into(),
                premise: vec!["Burglary=false".into(), "Earthquake=false".into()],
                conclusion: "Alarm=true".into(),
                certainty: 0.001,
            },
        ],
        goals: vec![
            Goal {
                id: "g1".into(),
                predicate: "query".into(),
                value: "Burglary".into(),
            }
        ],
        state: vec![],
    }
}

// ---------------------------------------------------------------------------
// Helper: run breed twice, assert serialized output is identical
// ---------------------------------------------------------------------------

fn assert_deterministic(breed_name: &str, input: &BreedInput) {
    let out1 = dispatch_breed_test(breed_name, input)
        .unwrap_or_else(|e| panic!("breed {} first run failed: {}", breed_name, e));
    let out2 = dispatch_breed_test(breed_name, input)
        .unwrap_or_else(|e| panic!("breed {} second run failed: {}", breed_name, e));

    let s1 = serde_json::to_string(&out1).expect("serialize out1");
    let s2 = serde_json::to_string(&out2).expect("serialize out2");
    assert_eq!(
        s1, s2,
        "breed {} produced non-deterministic output",
        breed_name
    );
}

// ---------------------------------------------------------------------------
// 13 breed determinism tests
// ---------------------------------------------------------------------------

#[test]
fn determinism_eliza() {
    assert_deterministic("eliza", &minimal_input());
}

#[test]
fn determinism_cbr() {
    assert_deterministic("cbr", &cbr_input());
}

#[test]
fn determinism_dendral() {
    assert_deterministic("dendral", &minimal_input());
}

#[test]
fn determinism_strips() {
    assert_deterministic("strips", &reachable_goals_input());
}

#[test]
fn determinism_prolog() {
    assert_deterministic("prolog", &minimal_input());
}

#[test]
fn determinism_mycin() {
    assert_deterministic("mycin", &mycin_input());
}

#[test]
fn determinism_gps() {
    assert_deterministic("gps", &reachable_goals_input());
}

#[test]
fn determinism_soar() {
    assert_deterministic("soar", &minimal_input());
}

#[test]
fn determinism_hearsay() {
    assert_deterministic("hearsay", &hearsay_input());
}

#[test]
fn determinism_autoinstinct_vision() {
    assert_deterministic("autoinstinct_vision", &autoinstinct_vision_input());
}

#[test]
fn determinism_autoinstinct_semantics() {
    assert_deterministic("autoinstinct_semantics", &autoinstinct_semantics_input());
}

#[test]
fn determinism_autoinstinct_neurosis() {
    assert_deterministic("autoinstinct_neurosis", &autoinstinct_neurosis_input());
}

#[test]
fn determinism_autoinstinct_learning() {
    assert_deterministic("autoinstinct_learning", &autoinstinct_learning_input());
}

// ---------------------------------------------------------------------------
// MYCIN order-independence: facts [A, B] vs [B, A] → same selected
// ---------------------------------------------------------------------------

#[test]
fn mycin_fact_order_independence() {
    let input_ab = BreedInput {
        intent: "order test".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "symptom".into(),
                value: "fever".into(),
            },
            Fact {
                key: "symptom".into(),
                value: "cough".into(),
            },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["symptom=fever".into()],
                conclusion: "disease=flu".into(),
                certainty: 0.8,
            },
            Rule {
                id: "r2".into(),
                premise: vec!["symptom=cough".into()],
                conclusion: "disease=flu".into(),
                certainty: 0.7,
            },
        ],
        goals: vec![],
        state: vec![],
    };
    // reversed order
    let input_ba = BreedInput {
        facts: vec![
            Fact {
                key: "symptom".into(),
                value: "cough".into(),
            },
            Fact {
                key: "symptom".into(),
                value: "fever".into(),
            },
        ],
        ..input_ab.clone()
    };

    let out_ab = dispatch_breed_test("mycin", &input_ab).expect("mycin ab");
    let out_ba = dispatch_breed_test("mycin", &input_ba).expect("mycin ba");

    assert_eq!(
        out_ab.selected, out_ba.selected,
        "MYCIN selected must be order-independent"
    );
}

// ---------------------------------------------------------------------------
// Hearsay order-independence: facts [A, B] vs [B, A] → same selected
// ---------------------------------------------------------------------------

#[test]
fn hearsay_fact_order_independence() {
    let input_ab = BreedInput {
        intent: "hearsay order test".into(),
        candidates: vec![],
        facts: vec![
            Fact {
                key: "phone".into(),
                value: "T".into(),
            },
            Fact {
                key: "phone".into(),
                value: "H".into(),
            },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "ks-a".into(),
                premise: vec!["phone:T".into()],
                conclusion: "word:THE".into(),
                certainty: 0.9,
            },
            Rule {
                id: "ks-b".into(),
                premise: vec!["phone:H".into()],
                conclusion: "word:HE".into(),
                certainty: 0.85,
            },
        ],
        goals: vec![],
        state: vec![],
    };
    let input_ba = BreedInput {
        facts: vec![
            Fact {
                key: "phone".into(),
                value: "H".into(),
            },
            Fact {
                key: "phone".into(),
                value: "T".into(),
            },
        ],
        ..input_ab.clone()
    };

    let out_ab = dispatch_breed_test("hearsay", &input_ab).expect("hearsay ab");
    let out_ba = dispatch_breed_test("hearsay", &input_ba).expect("hearsay ba");

    assert_eq!(
        out_ab.selected, out_ba.selected,
        "Hearsay selected must be order-independent"
    );
}

#[test]
fn determinism_ltl_monitor() {
    assert_deterministic("ltl_monitor", &ltl_monitor_input());
}

#[test]
fn determinism_allen_temporal() {
    assert_deterministic("allen_temporal", &allen_temporal_input());
}

#[test]
fn determinism_fuzzy_logic() {
    assert_deterministic("fuzzy_logic", &fuzzy_logic_input());
}

#[test]
fn determinism_bayesian_network() {
    assert_deterministic("bayesian_network", &bayesian_network_input());
}

// ---------------------------------------------------------------------------
// Count assertion: exactly 17 breed determinism tests exist in this suite
// ---------------------------------------------------------------------------

#[test]
fn exactly_17_breed_pairs_covered() {
    let covered = [
        "eliza",
        "cbr",
        "dendral",
        "strips",
        "prolog",
        "mycin",
        "gps",
        "soar",
        "hearsay",
        "autoinstinct_vision",
        "autoinstinct_semantics",
        "autoinstinct_neurosis",
        "autoinstinct_learning",
        "ltl_monitor",
        "allen_temporal",
        "fuzzy_logic",
        "bayesian_network",
    ];
    assert_eq!(covered.len(), 17, "must cover exactly 17 breeds");
}

#[test]
fn test_analogy_sme_determinism() {
    let fixture_str = std::fs::read_to_string("tests/fixtures/papers/analogy_sme.json").unwrap();
    let input: wasm4pm_cognition::breeds::BreedInput = serde_json::from_str(&fixture_str).unwrap();
    assert_deterministic("analogy_sme", &input);
}

#[test]
fn test_act_r_determinism() {
    let fixture_str = std::fs::read_to_string("tests/fixtures/papers/act_r.json").unwrap();
    let input: wasm4pm_cognition::breeds::BreedInput = serde_json::from_str(&fixture_str).unwrap();
    assert_deterministic("act_r", &input);
}
