//! Gated-dispatch OCEL conformance — closes a trust hole in the native test
//! suite (van der Aalst doctrine).
//!
//! Root cause: every other native cognition test routes breeds through
//! `dispatch_breed_test()` (see `src/breeds/dispatch.rs`), which calls
//! `CognitionBreed::run()` directly and SKIPS the OCEL lifecycle-conformance
//! gate. The WASM bridge (`src/wasm.rs`) instead routes every call through
//! `dispatch_breed()` → `run_breed()`, which enforces
//! `preconditions → run → postconditions → OCEL conformance`. Because no
//! native test exercised the gated path, a real lifecycle-model gap (ELIZA's
//! wildcard-frame fallback trace shape not being declared in
//! `ELIZA_MODEL`, see `src/ocel/models_p0.rs`) went undetected natively —
//! `dispatch_breed_test` happily returned `Ok` while `dispatch_breed` would
//! have refused with an OCEL conformance failure.
//!
//! This file asserts `dispatch_breed()` (the GATED path) returns `Ok` for a
//! broad sample of breeds, using inputs shaped like what the TS integration
//! test contracts actually send — including empty/fallback-path inputs, not
//! just the happy-path fixtures used by `dispatch_smoke.rs`.

use wasm4pm_cognition::breeds::{
    dispatch_breed, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

fn empty_input(intent: &str) -> BreedInput {
    BreedInput {
        intent: intent.to_string(),
        candidates: vec![],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

fn rule(id: &str, premise: Vec<&str>, conclusion: &str, certainty: f32) -> Rule {
    Rule {
        id: id.into(),
        premise: premise.into_iter().map(String::from).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

/// Assert the GATED path (preconditions → run → postconditions → OCEL
/// conformance) succeeds for `breed` given `input`. This is the check that
/// was missing natively — `dispatch_breed_test` alone cannot catch a
/// lifecycle-model gap because it never runs the conformance gate.
fn assert_gated_ok(breed: &str, input: &BreedInput) {
    let result = dispatch_breed(breed, input);
    assert!(
        result.is_ok(),
        "{breed}: expected gated dispatch (preconditions+run+postconditions+OCEL conformance) \
         to succeed, got: {:?}",
        result.err()
    );
    let output = result.unwrap();
    assert!(
        output.ocel_log.is_some(),
        "{breed}: gated dispatch must attach an OCEL log"
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Breeds fixed today — the exact bug class this file exists to catch.
// ─────────────────────────────────────────────────────────────────────────

/// ELIZA's wildcard-frame fallback path (input.rules empty) emits
/// try-pattern/match-pattern/bind-slot — a *different* trace-kind set than
/// the keyword-engine path (keyword-found/equivalence/decomp-match). Before
/// today's fix, ELIZA_MODEL only declared the keyword-engine kinds, so this
/// exact fallback input would have failed the gated path while
/// dispatch_breed_test (used by every other native test) stayed green.
#[test]
fn eliza_wildcard_fallback_path_gated_ok() {
    let mut input = empty_input("hello there, i am sad");
    // rules intentionally empty -> exercises the wildcard-frame fallback,
    // not the keyword-engine path exercised by tests/fixtures/papers/eliza.json.
    input.facts = vec![fact("frame:sad:pattern", "i am sad")];
    assert_gated_ok("eliza", &input);
}

/// ELIZA keyword-engine path (input.rules non-empty) — the other legitimate
/// run() branch, must also stay conforming under the gate.
#[test]
fn eliza_keyword_engine_path_gated_ok() {
    let mut input = empty_input("i am sad today");
    input.rules = vec![rule(
        "kw-sad",
        vec!["sad"],
        "WHY DO YOU SAY YOU ARE SAD",
        1.0,
    )];
    assert_gated_ok("eliza", &input);
}

/// description_logic's TS contract sends bare `subclass`/`class`/`disjoint`
/// facts and an EMPTY goals list (the old `dl:subclass:*` fact grammar +
/// explicit `dl:subsumes` goal is no longer what callers send).
#[test]
fn description_logic_empty_goals_contract_gated_ok() {
    let mut input = empty_input("dl reasoning");
    input.candidates = vec![Candidate {
        id: "x".into(),
        score: 0.5,
        eliminated: false,
        elimination_reason: None,
    }];
    input.facts = vec![
        fact("subclass", "A,B"),
        fact("subclass", "B,C"),
        fact("class", "x,A"),
        fact("disjoint", "C,D"),
    ];
    // goals intentionally empty per current TS contract.
    assert_gated_ok("description_logic", &input);
}

/// partial_order_plan's TS contract now sends the action as a `Rule`
/// (id/premise/conclusion/certainty with `!key=value` deletions), with
/// `facts` EMPTY — the old `pop:op:<name>:{pre,add,del}` fact grammar is no
/// longer read by run()/preconditions().
#[test]
fn partial_order_plan_rules_contract_gated_ok() {
    let mut input = empty_input("planning");
    input.rules = vec![rule(
        "pickup",
        vec!["at_depot=true"],
        "holding=true; !at_depot=true",
        1.0,
    )];
    input.goals = vec![Goal {
        id: "g1".into(),
        predicate: "holding".into(),
        value: "true".into(),
    }];
    input.state = vec![StateAtom {
        predicate: "at_depot".into(),
        value: "true".into(),
    }];
    assert_gated_ok("partial_order_plan", &input);
}

/// script_sam falls back to the built-in restaurant script when input.rules
/// is empty; that script cannot align to airport-shaped observations. The
/// TS contract now supplies an explicit airport script Rule so the "fly"
/// gap scene is inferable and the lifecycle completes.
#[test]
fn script_sam_explicit_airport_script_gated_ok() {
    let mut input = empty_input("airport scenario");
    input.facts = vec![
        fact("sam:event:0", "checkin:alice"),
        fact("sam:event:1", "security:alice"),
        fact("sam:event:2", "board:alice"),
        fact("sam:event:4", "land:alice"),
    ];
    input.rules = vec![rule(
        "airport_script",
        vec![
            "checkin($customer)",
            "security($customer)",
            "board($customer)",
            "fly($customer)",
            "land($customer)",
        ],
        "airport",
        1.0,
    )];
    assert_gated_ok("script_sam", &input);
}

/// script_sam's built-in fallback path (input.rules empty) — the restaurant
/// script — must also stay conforming under the gate.
#[test]
fn script_sam_builtin_fallback_path_gated_ok() {
    let mut input = empty_input("restaurant scenario");
    input.facts = vec![
        fact("sam:event:0", "enter:bob"),
        fact("sam:event:1", "order:bob"),
        fact("sam:event:2", "eat:bob"),
        fact("sam:event:3", "pay:bob"),
    ];
    // rules intentionally empty -> built-in restaurant script fallback.
    assert_gated_ok("script_sam", &input);
}

// ─────────────────────────────────────────────────────────────────────────
// Broader sample of other breeds, gated path, minimal/empty-leaning inputs
// (mirroring what TS integration contracts actually send — not just the
// curated happy-path fixtures dispatch_smoke.rs / paper fixtures use).
// ─────────────────────────────────────────────────────────────────────────

#[test]
fn mycin_gated_ok() {
    let mut input = empty_input("mycin diagnosis");
    input.facts = vec![fact("symptom", "fever"), fact("symptom", "cough")];
    input.rules = vec![
        rule(
            "rule-infection",
            vec!["symptom=fever", "symptom=cough"],
            "infection=true",
            0.85,
        ),
        rule(
            "rule-treat",
            vec!["infection=true"],
            "treatment=antibiotics",
            0.8,
        ),
    ];
    assert_gated_ok("mycin", &input);
}

#[test]
fn allen_temporal_gated_ok() {
    let mut input = empty_input("temporal reasoning");
    input.facts = vec![
        fact("relation", "A meets B"),
        fact("relation", "B during C"),
    ];
    assert_gated_ok("allen_temporal", &input);
}

#[test]
fn bayesian_network_gated_ok() {
    let mut input = empty_input("bayes query");
    input.facts = vec![
        fact("cpt:Q", "0.3"),
        fact("cpt:R|Q", "0.2,0.8"),
        fact("cpt:S|R", "0.1,0.7"),
        fact("evidence:Q", "true"),
    ];
    input.goals = vec![Goal {
        id: "g1".into(),
        predicate: "query".into(),
        value: "prob:S".into(),
    }];
    assert_gated_ok("bayesian_network", &input);
}

#[test]
fn csp_ac3_gated_ok() {
    let mut input = empty_input("csp");
    input.facts = vec![
        fact("csp-var", "V1:B,G,R"),
        fact("csp-var", "V2:B,G,R"),
        fact("csp-var", "V3:B,G,R"),
        fact("csp-constraint", "V1!=V2"),
        fact("csp-constraint", "V2!=V3"),
        fact("csp-constraint", "V1!=V3"),
    ];
    assert_gated_ok("csp_ac3", &input);
}

#[test]
fn fuzzy_logic_gated_ok() {
    let mut input = empty_input("fuzzy control");
    input.facts = vec![
        fact("fuzzy:zlorp:mid", "tri:2,5,8"),
        fact("fuzzy:gwib:out", "tri:0,50,100"),
        fact("fuzzy:input:zlorp", "3.7"),
    ];
    input.rules = vec![rule("r1", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0)];
    assert_gated_ok("fuzzy_logic", &input);
}

#[test]
fn ltl_monitor_gated_ok() {
    let mut input = empty_input("G (red -> !green)");
    input.facts = vec![
        fact("ltl:formula", "G (red -> !green)"),
        fact("trace:0", "red"),
        fact("trace:1", "green"),
    ];
    assert_gated_ok("ltl_monitor", &input);
}

/// LTL violating-trace variant sent by the TS contract's `violating_input`
/// (a G(req -> F res) formula with `req` true and never `res` true) — the
/// non-satisfying branch of run() must also stay conforming under the gate.
#[test]
fn ltl_monitor_violating_trace_gated_ok() {
    let mut input = empty_input("G (req -> F res)");
    input.cases = vec![
        Case {
            id: "state0".into(),
            intent: String::new(),
            architecture: String::new(),
            outcome_score: 1.0,
            facts: vec![fact("req", "true")],
        },
        Case {
            id: "state1".into(),
            intent: String::new(),
            architecture: String::new(),
            outcome_score: 1.0,
            facts: vec![],
        },
    ];
    assert_gated_ok("ltl_monitor", &input);
}

#[test]
fn default_logic_gated_ok() {
    let mut input = empty_input("default reasoning");
    input.facts = vec![fact("obs:tweety", "penguin")];
    input.rules = vec![
        rule("r_isa", vec!["penguin"], "bird", 1.0),
        rule("r_penguin", vec!["penguin"], "not_flies", 1.0),
        rule(
            "r_birds_fly",
            vec!["bird", "unless:not_flies"],
            "flies",
            0.9,
        ),
    ];
    assert_gated_ok("default_logic", &input);
}

#[test]
fn dempster_shafer_gated_ok() {
    let mut input = empty_input("evidence combination");
    input.rules = vec![
        rule("witnessA", vec![], "flim", 0.5),
        rule("witnessB", vec![], "flam", 0.75),
    ];
    input.goals = vec![Goal {
        id: "query".into(),
        predicate: "query".into(),
        value: "flim".into(),
    }];
    assert_gated_ok("dempster_shafer", &input);
}

#[test]
fn frames_inheritance_gated_ok() {
    let mut input = empty_input("resolve zilk color");
    input.facts = vec![
        fact("frame:zilk:isa", "welp"),
        fact("frame:welp:slot:color", "red"),
    ];
    assert_gated_ok("frames_inheritance", &input);
}

#[test]
fn htn_planning_gated_ok() {
    let mut input = empty_input("delivery planning");
    input.state = vec![
        StateAtom {
            predicate: "pkg".into(),
            value: "at_depot".into(),
        },
        StateAtom {
            predicate: "truck".into(),
            value: "at_depot".into(),
        },
    ];
    input.goals = vec![Goal {
        id: "g1".into(),
        predicate: "task".into(),
        value: "deliver".into(),
    }];
    input.rules = vec![
        rule(
            "method:deliver:by_truck",
            vec!["pkg=at_depot"],
            "op:load;op:drive;op:unload",
            1.0,
        ),
        rule(
            "op:load",
            vec!["pkg=at_depot", "truck=at_depot"],
            "!pkg=at_depot;pkg=in_truck",
            1.0,
        ),
        rule(
            "op:drive",
            vec!["truck=at_depot"],
            "!truck=at_depot;truck=at_dest",
            1.0,
        ),
        rule(
            "op:unload",
            vec!["pkg=in_truck", "truck=at_dest"],
            "!pkg=in_truck;pkg=at_dest",
            1.0,
        ),
    ];
    assert_gated_ok("htn_planning", &input);
}

#[test]
fn asp_gated_ok() {
    let input = fixture_input("asp");
    assert_gated_ok("asp", &input);
}

#[test]
fn abductive_lp_gated_ok() {
    let input = fixture_input("abductive_lp");
    assert_gated_ok("abductive_lp", &input);
}

#[test]
fn event_calculus_gated_ok() {
    let input = fixture_input("event_calculus");
    assert_gated_ok("event_calculus", &input);
}

#[test]
fn mdp_gated_ok() {
    let input = fixture_input("mdp");
    assert_gated_ok("mdp", &input);
}

#[test]
fn clp_gated_ok() {
    let input = fixture_input("clp");
    assert_gated_ok("clp", &input);
}

#[test]
fn sat_cdcl_gated_ok() {
    let mut input = empty_input("sat solving");
    input.facts = vec![
        fact("clause:00", "1 2"),
        fact("clause:01", "-1 2"),
        fact("clause:02", "1 -2"),
        fact("clause:03", "-1 -2"),
    ];
    assert_gated_ok("sat_cdcl", &input);
}

#[test]
fn ctl_check_gated_ok() {
    let mut input = empty_input("ctl model checking");
    input.facts = vec![
        fact("ts:init", "a"),
        fact("ts:edge:a", "b"),
        fact("ts:edge:b", "a"),
        fact("ts:label:b", "p"),
        fact("ctl:formula", "A F p"),
    ];
    assert_gated_ok("ctl_check", &input);
}

#[test]
fn tableaux_gated_ok() {
    let mut input = empty_input("conformance");
    input.facts = vec![fact("tableaux:formula", "((a -> b) -> a) -> a")];
    assert_gated_ok("tableaux", &input);
}

#[test]
fn markov_logic_gated_ok() {
    let mut input = empty_input("conformance");
    input.facts = vec![
        fact("mln:clause:c1", "1.5|!smokes_anna,cancer_anna"),
        fact(
            "mln:clause:c2",
            "1.1|!friends_ab,!smokes_anna,smokes_bob",
        ),
        fact("evidence:smokes_anna", "true"),
        fact("evidence:friends_ab", "true"),
    ];
    assert_gated_ok("markov_logic", &input);
}

fn fixture_input(breed: &str) -> BreedInput {
    let path = format!("tests/fixtures/papers/{}.json", breed);
    let content = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {}", path, e));
    let json: serde_json::Value = serde_json::from_str(&content).unwrap();
    serde_json::from_value(json["input"].clone()).unwrap_or_else(|e| panic!("{} input: {}", path, e))
}
