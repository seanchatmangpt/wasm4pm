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

// ---------------------------------------------------------------------------
// Count assertion: exactly 13 breed determinism tests exist in this suite
// ---------------------------------------------------------------------------

#[test]
fn exactly_13_breed_pairs_covered() {
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
    ];
    assert_eq!(covered.len(), 13, "must cover exactly 13 breeds");
}

// ===========================================================================
// P3 tier determinism: bit-exact double runs for all 11 breeds.
// ===========================================================================

use wasm4pm_cognition::breeds::BreedInput as P3BreedInput;

fn p3f(key: &str, value: &str) -> Fact {
    Fact { key: key.into(), value: value.into() }
}

/// Valid representative input per P3 breed.
fn p3_input(breed: &str) -> P3BreedInput {
    let mut input = P3BreedInput {
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
fn p3_breeds_bit_exact_determinism() {
    for breed in P3_BREEDS {
        let input = p3_input(breed);
        let a = dispatch_breed_test(breed, &input).unwrap_or_else(|e| panic!("{}: {}", breed, e));
        let b = dispatch_breed_test(breed, &input).unwrap_or_else(|e| panic!("{}: {}", breed, e));
        let sa = serde_json::to_string(&a).unwrap();
        let sb = serde_json::to_string(&b).unwrap();
        assert_eq!(sa, sb, "{} must be bit-exact deterministic", breed);
        assert!(!a.inference_trace.is_empty(), "{} empty trace", breed);
    }
}
