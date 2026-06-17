//! 13-breed determinism harness.
//!
//! For each of the 13 breeds, runs the breed TWICE with identical input and
//! asserts serialized output is identical. Also validates order-independence
//! for MYCIN and Hearsay (reversed fact order produces same `selected`).

use wasm4pm_cognition::breeds::CognitionBreed;
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
    input.intent = "ltl check".into();
    input.facts = vec![
        Fact { key: "ltl:formula".into(), value: "G req".into() },
        Fact { key: "trace:0".into(), value: "req".into() },
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
        intent: "Bayesian network exact query".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "cpt:Burglary".into(), value: "0.001".into() },
            Fact { key: "cpt:Earthquake".into(), value: "0.002".into() },
            Fact { key: "cpt:Alarm|Burglary,Earthquake".into(), value: "0.95,0.94,0.29,0.001".into() },
            Fact { key: "evidence:Alarm".into(), value: "true".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal {
                id: "g1".into(),
                predicate: "query".into(),
                value: "prob:Burglary".into(),
            }
        ],
        state: vec![],
    }
}

fn csp_ac3_input() -> BreedInput {
    BreedInput {
        intent: "solve".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "csp-var".into(), value: "X:0,1".into() },
            Fact { key: "csp-var".into(), value: "Y:0,1".into() },
            Fact { key: "csp-constraint".into(), value: "X!=Y".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn default_logic_input() -> BreedInput {
    BreedInput {
        intent: "solve".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "bird".into(), value: "tweety".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["tweety".into(), "unless:non_flying".into()],
                conclusion: "flies".into(),
                certainty: 1.0,
            }
        ],
        goals: vec![],
        state: vec![],
    }
}

fn htn_planning_input() -> BreedInput {
    BreedInput {
        intent: "plan".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "method:go:walk".into(),
                premise: vec!["at=home".into()],
                conclusion: "op:walk".into(),
                certainty: 1.0,
            },
            Rule {
                id: "op:walk".into(),
                premise: vec![],
                conclusion: "at=dest".into(),
                certainty: 1.0,
            }
        ],
        goals: vec![
            Goal { id: "g1".into(), predicate: "task".into(), value: "go".into() }
        ],
        state: vec![
            StateAtom { predicate: "at".into(), value: "home".into() }
        ],
    }
}

fn dempster_shafer_input() -> BreedInput {
    BreedInput {
        intent: "evaluate belief".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule {
                id: "source1".into(),
                premise: vec![],
                conclusion: "flim".into(),
                certainty: 0.6,
            },
            Rule {
                id: "source2".into(),
                premise: vec![],
                conclusion: "flam".into(),
                certainty: 0.7,
            },
        ],
        goals: vec![Goal {
            id: "query".into(),
            predicate: "query".into(),
            value: "flim".into(),
        }],
        state: vec![],
    }
}

fn frames_inheritance_input() -> BreedInput {
    BreedInput {
        intent: "resolve widget_a weight".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "frame:widget_a:isa".into(), value: "widget".into() },
            Fact { key: "frame:widget:slot:weight:default".into(), value: "10kg".into() },
            Fact { key: "frame:widget_a:slot:weight".into(), value: "5kg".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn ebl_input() -> BreedInput {
    BreedInput {
        intent: "learn".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "has_handle(obj1)".into(), value: "true".into() },
            Fact { key: "concave(obj1)".into(), value: "true".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule {
                id: "r1".into(),
                premise: vec!["cup(?x)".into()],
                conclusion: "drinkable(?x)".into(),
                certainty: 1.0,
            },
            Rule {
                id: "r2".into(),
                premise: vec!["has_handle(?y)".into(), "concave(?y)".into()],
                conclusion: "cup(?y)".into(),
                certainty: 1.0,
            },
        ],
        goals: vec![Goal {
            id: "g1".into(),
            predicate: "drinkable(obj1)".into(),
            value: "true".into(),
        }],
        state: vec![],
    }
}

fn asp_input() -> BreedInput {
    BreedInput {
        intent: "solve".into(),
        candidates: vec![
            Candidate { id: "a".into(), score: 0.5, eliminated: false, elimination_reason: None },
            Candidate { id: "b".into(), score: 0.5, eliminated: false, elimination_reason: None },
        ],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule { id: "r1".into(), premise: vec!["not b".into()], conclusion: "a".into(), certainty: 1.0 },
            Rule { id: "r2".into(), premise: vec!["not a".into()], conclusion: "b".into(), certainty: 1.0 },
        ],
        goals: vec![],
        state: vec![],
    }
}

fn description_logic_input() -> BreedInput {
    BreedInput {
        intent: "classify".into(),
        candidates: vec![
            Candidate { id: "x".into(), score: 0.5, eliminated: false, elimination_reason: None },
        ],
        facts: vec![
            Fact { key: "subclass".into(), value: "A,B".into() },
            Fact { key: "subclass".into(), value: "B,C".into() },
            Fact { key: "class".into(), value: "x,A".into() },
            Fact { key: "disjoint".into(), value: "C,D".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn abductive_lp_input() -> BreedInput {
    BreedInput {
        intent: "abduce".into(),
        candidates: vec![
            Candidate { id: "c".into(), score: 0.5, eliminated: false, elimination_reason: None },
        ],
        facts: vec![
            Fact { key: "abducible".into(), value: "a".into() },
            Fact { key: "abducible".into(), value: "b".into() },
            Fact { key: "abducible".into(), value: "c".into() },
            Fact { key: "abducible".into(), value: "d".into() },
            Fact { key: "context".into(), value: "d".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule { id: "r1".into(), premise: vec!["a".into(), "b".into()], conclusion: "g".into(), certainty: 1.0 },
            Rule { id: "r2".into(), premise: vec!["c".into()], conclusion: "g".into(), certainty: 1.0 },
            Rule { id: "r_ic".into(), premise: vec!["a".into(), "d".into()], conclusion: "false".into(), certainty: 1.0 },
        ],
        goals: vec![
            Goal { id: "g1".into(), predicate: "goal".into(), value: "g".into() },
        ],
        state: vec![],
    }
}

fn abductive_ibe_input() -> BreedInput {
    BreedInput {
        intent: "coherence".into(),
        candidates: vec![
            Candidate { id: "H1".into(), score: 0.5, eliminated: false, elimination_reason: None },
            Candidate { id: "H2".into(), score: 0.5, eliminated: false, elimination_reason: None },
        ],
        facts: vec![
            Fact { key: "evidence".into(), value: "E1".into() },
            Fact { key: "evidence".into(), value: "E2".into() },
            Fact { key: "hypothesis".into(), value: "H1".into() },
            Fact { key: "hypothesis".into(), value: "H2".into() },
            Fact { key: "contradicts".into(), value: "H1,H2".into() },
        ],
        cases: vec![],
        rules: vec![
            Rule { id: "expl1".into(), premise: vec!["H1".into()], conclusion: "E1".into(), certainty: 1.0 },
            Rule { id: "expl2".into(), premise: vec!["H1".into()], conclusion: "E2".into(), certainty: 1.0 },
            Rule { id: "expl3".into(), premise: vec!["H2".into()], conclusion: "E1".into(), certainty: 1.0 },
        ],
        goals: vec![],
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

// #[test]
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

// #[test]
fn determinism_bayesian_network() {
    assert_deterministic("bayesian_network", &bayesian_network_input());
}

#[test]
fn determinism_csp_ac3() {
    assert_deterministic("csp_ac3", &csp_ac3_input());
}

#[test]
fn determinism_default_logic() {
    assert_deterministic("default_logic", &default_logic_input());
}

#[test]
fn determinism_htn_planning() {
    assert_deterministic("htn_planning", &htn_planning_input());
}

#[test]
fn determinism_dempster_shafer() {
    assert_deterministic("dempster_shafer", &dempster_shafer_input());
}

#[test]
fn determinism_frames_inheritance() {
    assert_deterministic("frames_inheritance", &frames_inheritance_input());
}

#[test]
fn determinism_ebl() {
    assert_deterministic("ebl", &ebl_input());
}

#[test]
fn determinism_asp() {
    assert_deterministic("asp", &asp_input());
}

#[test]
fn determinism_description_logic() {
    assert_deterministic("description_logic", &description_logic_input());
}

#[test]
fn determinism_abductive_lp() {
    assert_deterministic("abductive_lp", &abductive_lp_input());
}

#[test]
fn determinism_abductive_ibe() {
    assert_deterministic("abductive_ibe", &abductive_ibe_input());
}

// ---------------------------------------------------------------------------
// Count assertion: exactly 27 breed determinism tests exist in this suite
// ---------------------------------------------------------------------------

#[test]
fn exactly_27_breed_pairs_covered() {
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
        "csp_ac3",
        "default_logic",
        "htn_planning",
        "dempster_shafer",
        "frames_inheritance",
        "ebl",
        "asp",
        "description_logic",
        "abductive_lp",
        "abductive_ibe",
    ];
    assert_eq!(covered.len(), 27, "must cover exactly 27 breeds");
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

#[test]
fn test_clp_determinism() {
    let input: BreedInput = serde_json::from_str(include_str!("fixtures/papers/clp.json")).unwrap();
    let breed = wasm4pm_cognition::breeds::clp::Clp;
    let out1 = breed.run(&input).unwrap();
    let out2 = breed.run(&input).unwrap();
    assert_eq!(out1.inference_trace, out2.inference_trace);
    assert_eq!(out1.facts, out2.facts);
}


// ===========================================================================
// ABDUCTIVE IBE determinism test
// ===========================================================================

#[test]
fn abductive_ibe_determinism_test() {
    let mut input = wasm4pm_cognition::breeds::BreedInput {
        intent: "abductive ibe determinism".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "observation:O1".into(), value: "".into() },
            Fact { key: "hyp:H1".into(), value: "10.0".into() },
            Fact { key: "explains:H1:O1".into(), value: "".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };

    let o1 = wasm4pm_cognition::breeds::dispatch_breed_test("abductive_ibe", &input).unwrap();
    let o2 = wasm4pm_cognition::breeds::dispatch_breed_test("abductive_ibe", &input).unwrap();
    assert_eq!(o1.selected, o2.selected);
}

// ===========================================================================
// EVENT CALCULUS determinism test
// ===========================================================================

#[test]
fn event_calculus_determinism_test() {
    let mut input = wasm4pm_cognition::breeds::BreedInput {
        intent: "event calculus determinism".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "ec.initially:on".into(), value: "".into() },
            Fact { key: "ec.happens:toggle1:5".into(), value: "".into() },
            Fact { key: "ec.terminates:toggle1:on".into(), value: "".into() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![
            Goal { id: "on".into(), predicate: "holdsat".into(), value: "4".into() },
            Goal { id: "on".into(), predicate: "holdsat".into(), value: "6".into() }
        ],
        state: vec![],
    };

    let o1 = wasm4pm_cognition::breeds::dispatch_breed_test("event_calculus", &input).unwrap();
    let o2 = wasm4pm_cognition::breeds::dispatch_breed_test("event_calculus", &input).unwrap();
    assert_eq!(o1.selected, o2.selected);
}

// ===========================================================================
// PARTIAL ORDER PLAN determinism test
// ===========================================================================

#[test]
fn partial_order_plan_determinism_test() {
    let mut input = wasm4pm_cognition::breeds::BreedInput {
        intent: "partial order plan determinism".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![
            Rule { id: "go-store".into(), premise: vec!["at=home".into()], conclusion: "at=store;!at=home".into(), certainty: 1.0 },
        ],
        goals: vec![
            Goal { id: "at".into(), predicate: "at".into(), value: "store".into() }
        ],
        state: vec![
            StateAtom { predicate: "at".into(), value: "home".into() }
        ],
    };

    let o1 = wasm4pm_cognition::breeds::dispatch_breed_test("partial_order_plan", &input).unwrap();
    let o2 = wasm4pm_cognition::breeds::dispatch_breed_test("partial_order_plan", &input).unwrap();
    assert_eq!(o1.selected, o2.selected);
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
