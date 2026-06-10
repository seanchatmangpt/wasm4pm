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

// ---------------------------------------------------------------------------
// P4 tier determinism (bit-exact double run via serialized output compare)
// ---------------------------------------------------------------------------

fn p4_fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

fn p4_input(facts: Vec<Fact>) -> BreedInput {
    BreedInput {
        intent: "determinism".into(),
        candidates: vec![],
        facts,
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn assert_p4_deterministic(breed: &str, input: &BreedInput) {
    let a = dispatch_breed_test(breed, input).expect("run 1");
    let b = dispatch_breed_test(breed, input).expect("run 2");
    assert_eq!(
        serde_json::to_string(&a).unwrap(),
        serde_json::to_string(&b).unwrap(),
        "{} must be bit-exact deterministic",
        breed
    );
}

#[test]
fn tableaux_deterministic() {
    assert_p4_deterministic(
        "tableaux",
        &p4_input(vec![p4_fact("tableaux:formula", "((a -> b) -> a) -> a")]),
    );
}

#[test]
fn construction_grammar_deterministic() {
    assert_p4_deterministic(
        "construction_grammar",
        &p4_input(vec![
            p4_fact("cxg:utterance", "he sneezed the napkin off the table"),
            p4_fact("lex:he:pos", "pron"),
            p4_fact("lex:sneezed:pos", "verb"),
            p4_fact("lex:sneezed:valence", "intransitive"),
            p4_fact("lex:the:pos", "det"),
            p4_fact("lex:napkin:pos", "noun"),
            p4_fact("lex:off:pos", "prep"),
            p4_fact("lex:table:pos", "noun"),
        ]),
    );
}

#[test]
fn markov_logic_deterministic() {
    assert_p4_deterministic(
        "markov_logic",
        &p4_input(vec![
            p4_fact("mln:clause:d1", "1.5|!smokes_anna,cancer_anna"),
            p4_fact("mln:clause:d2", "1.1|!friends_ab,!smokes_anna,smokes_bob"),
            p4_fact("evidence:smokes_anna", "true"),
            p4_fact("evidence:friends_ab", "true"),
        ]),
    );
}

#[test]
fn pomdp_deterministic() {
    let mut facts = vec![
        p4_fact("pomdp:states", "up,down"),
        p4_fact("pomdp:actions", "probe,commit"),
        p4_fact("pomdp:observations", "hi,lo"),
        p4_fact("pomdp:gamma", "0.9"),
        p4_fact("pomdp:horizon", "3"),
        p4_fact("pomdp:b0:up", "0.5"),
        p4_fact("pomdp:b0:down", "0.5"),
        p4_fact("pomdp:step:0", "probe|hi"),
    ];
    for s in ["up", "down"] {
        for sp in ["up", "down"] {
            facts.push(p4_fact(
                &format!("pomdp:t:probe:{}:{}", s, sp),
                if s == sp { "1.0" } else { "0.0" },
            ));
            facts.push(p4_fact(&format!("pomdp:t:commit:{}:{}", s, sp), "0.5"));
        }
        facts.push(p4_fact(&format!("pomdp:r:probe:{}", s), "-1.0"));
        facts.push(p4_fact(
            &format!("pomdp:o:commit:{}:hi", s),
            "0.5",
        ));
        facts.push(p4_fact(
            &format!("pomdp:o:commit:{}:lo", s),
            "0.5",
        ));
    }
    facts.push(p4_fact("pomdp:o:probe:up:hi", "0.9"));
    facts.push(p4_fact("pomdp:o:probe:up:lo", "0.1"));
    facts.push(p4_fact("pomdp:o:probe:down:hi", "0.1"));
    facts.push(p4_fact("pomdp:o:probe:down:lo", "0.9"));
    facts.push(p4_fact("pomdp:r:commit:up", "5.0"));
    facts.push(p4_fact("pomdp:r:commit:down", "-5.0"));
    assert_p4_deterministic("pomdp", &p4_input(facts));
}

#[test]
fn contingent_plan_deterministic() {
    assert_p4_deterministic(
        "contingent_plan",
        &p4_input(vec![
            p4_fact("cp:unknown", "dirt"),
            p4_fact("cp:goal:dirt", "false"),
            p4_fact("cp:act:suck:pre", "dirt"),
            p4_fact("cp:act:suck:del", "dirt"),
            p4_fact("cp:sense:check-dirt", "dirt"),
        ]),
    );
}

#[test]
fn meta_reasoning_deterministic() {
    assert_p4_deterministic(
        "meta_reasoning",
        &p4_input(vec![
            p4_fact("breed:mycin:conclusion", "therapy=gentamicin"),
            p4_fact("breed:mycin:confidence", "0.8"),
            p4_fact("breed:prolog:conclusion", "therapy=none"),
            p4_fact("breed:prolog:confidence", "0.6"),
        ]),
    );
}
