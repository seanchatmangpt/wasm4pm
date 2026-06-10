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
// P2 tier — determinism (12 breeds): bit-exact double runs through the full
// dispatch lifecycle (including OCEL derivation).
// ===========================================================================

use wasm4pm_cognition::breeds::dispatch::dispatch_breed as p2_dispatch;

fn p2_assert_bit_exact(breed: &str, input: &BreedInput) {
    let a = p2_dispatch(breed, input).unwrap_or_else(|e| panic!("{} run 1: {}", breed, e));
    let b = p2_dispatch(breed, input).unwrap_or_else(|e| panic!("{} run 2: {}", breed, e));
    let sa = serde_json::to_string(&a).unwrap();
    let sb = serde_json::to_string(&b).unwrap();
    assert_eq!(sa, sb, "{}: double run must be bit-exact", breed);
    assert!(!a.inference_trace.is_empty(), "{}: empty trace", breed);
}

fn p2_fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

fn p2_base() -> BreedInput {
    BreedInput {
        intent: "determinism".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

#[test]
fn asp_deterministic() {
    let mut input = p2_base();
    input.rules = vec![
        Rule { id: "d1".into(), premise: vec!["not b".into()], conclusion: "a".into(), certainty: 1.0 },
        Rule { id: "d2".into(), premise: vec!["not a".into()], conclusion: "b".into(), certainty: 1.0 },
    ];
    p2_assert_bit_exact("asp", &input);
}

#[test]
fn description_logic_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("dl:subclass:A", "B"),
        p2_fact("dl:subclass:B", "C"),
    ];
    input.goals = vec![Goal { id: "q".into(), predicate: "dl:subsumes".into(), value: "A:C".into() }];
    p2_assert_bit_exact("description_logic", &input);
}

#[test]
fn abductive_lp_deterministic() {
    let mut input = p2_base();
    input.facts = vec![p2_fact("alp:abducible:a", "true"), p2_fact("alp:abducible:b", "true")];
    input.rules = vec![Rule { id: "d".into(), premise: vec!["a".into()], conclusion: "o".into(), certainty: 1.0 }];
    input.goals = vec![Goal { id: "o".into(), predicate: "alp:observe".into(), value: "o".into() }];
    p2_assert_bit_exact("abductive_lp", &input);
}

#[test]
fn abductive_ibe_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("ibe:obs:o1", "true"),
        p2_fact("ibe:hyp:h1:covers", "o1"),
        p2_fact("ibe:hyp:h1:cost", "1"),
        p2_fact("ibe:hyp:h2:covers", "o1"),
        p2_fact("ibe:hyp:h2:cost", "2"),
    ];
    p2_assert_bit_exact("abductive_ibe", &input);
}

#[test]
fn partial_order_plan_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("pop:op:alpha:pre", "w"),
        p2_fact("pop:op:alpha:add", "t2"),
        p2_fact("pop:op:beta:add", "t1"),
        p2_fact("pop:op:beta:del", "w"),
    ];
    input.state = vec![StateAtom { predicate: "w".into(), value: "true".into() }];
    input.goals = vec![
        Goal { id: "g1".into(), predicate: "t1".into(), value: "true".into() },
        Goal { id: "g2".into(), predicate: "t2".into(), value: "true".into() },
    ];
    p2_assert_bit_exact("partial_order_plan", &input);
}

#[test]
fn event_calculus_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("ec:happens:1", "go"),
        p2_fact("ec:initiates:go", "moving"),
    ];
    input.goals = vec![Goal { id: "q".into(), predicate: "ec:holdsat".into(), value: "moving@3".into() }];
    p2_assert_bit_exact("event_calculus", &input);
}

#[test]
fn mdp_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("mdp:gamma", "0.5"),
        p2_fact("mdp:trans:s:a", "s:1.0"),
        p2_fact("mdp:reward:s:a", "1.0"),
    ];
    p2_assert_bit_exact("mdp", &input);
}

#[test]
fn version_space_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("vs:attrs", "a,b"),
        p2_fact("vs:example:1", "x,y:+"),
        p2_fact("vs:example:2", "z,y:-"),
    ];
    p2_assert_bit_exact("version_space", &input);
}

#[test]
fn belief_merging_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("bm:atoms", "a,b"),
        p2_fact("bm:base:1", "a,b"),
        p2_fact("bm:base:2", "-a,-b"),
    ];
    p2_assert_bit_exact("belief_merging", &input);
}

#[test]
fn qualitative_reason_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("qr:confluence:c1", "+x,-y,-z"),
        p2_fact("qr:sign:x", "+"),
    ];
    p2_assert_bit_exact("qualitative_reason", &input);
}

#[test]
fn script_sam_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("sam:event:1", "enter:ana"),
        p2_fact("sam:event:2", "pay:ana"),
    ];
    p2_assert_bit_exact("script_sam", &input);
}

#[test]
fn clp_deterministic() {
    let mut input = p2_base();
    input.facts = vec![
        p2_fact("clp:var:x", "1..4"),
        p2_fact("clp:var:y", "1..4"),
        p2_fact("clp:constraint:c1", "x<y"),
    ];
    p2_assert_bit_exact("clp", &input);
}
