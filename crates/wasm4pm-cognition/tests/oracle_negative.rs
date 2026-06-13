//! Oracle-negative tests: one REFUSAL test per breed (13 total).
//!
//! Each test sends a degenerate or impossible input and asserts that the
//! breed either returns Err, or (where the breed succeeds on trivially
//! satisfied input) that the output carries an empty / trivial payload.
//!
//! Oracle rank: Rank-2 (domain contract — preconditions documented in each
//! breed's source file and the cognition-contracts rule).
//!
//! Pure Rust — no wasm_bindgen, no mocking.

use wasm4pm_cognition::breeds::{
    dispatch_breed_test, BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn empty_base() -> BreedInput {
    BreedInput {
        intent: "test".into(),
        candidates: vec![Candidate {
            id: "c1".into(),
            score: 0.5,
            eliminated: false,
            elimination_reason: None,
        }],
        facts: vec![],
        cases: vec![],
        rules: vec![],
        goals: vec![],
        state: vec![],
    }
}

fn goal(id: &str, predicate: &str, value: &str) -> Goal {
    Goal {
        id: id.into(),
        predicate: predicate.into(),
        value: value.into(),
    }
}

fn state_atom(predicate: &str, value: &str) -> StateAtom {
    StateAtom {
        predicate: predicate.into(),
        value: value.into(),
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
        premise: premise.into_iter().map(|s| s.to_string()).collect(),
        conclusion: conclusion.into(),
        certainty,
    }
}

// ---------------------------------------------------------------------------
// 1. MYCIN — empty rules → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: MYCIN requires at least one rule; empty rules must be refused.
#[test]
fn mycin_empty_rules_refused() {
    use wasm4pm_cognition::breeds::production_rules::Mycin;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![fact("symptom", "fever")];
    input.rules = vec![]; // violates MYCIN precondition

    let result = Mycin.preconditions(&input);
    assert!(result.is_err(), "MYCIN must refuse empty rules vec; got Ok");
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("rule") || msg.to_lowercase().contains("mycin"),
        "error must mention rules or MYCIN, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 2. Prolog — empty facts + impossible goal → refused or empty result
// ---------------------------------------------------------------------------

/// Rank-2: Prolog with all-empty input must refuse (preconditions gate fires).
#[test]
fn prolog_impossible_query_refused() {
    use wasm4pm_cognition::breeds::prolog::Prolog;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "".into(); // empty intent
    input.goals = vec![];
    input.rules = vec![]; // no clauses → nothing to prove

    // Precondition: intent, goals, AND rules all empty → Err
    let result = Prolog.preconditions(&input);
    assert!(
        result.is_err(),
        "Prolog must refuse fully empty input; got Ok"
    );
}

// ---------------------------------------------------------------------------
// 3. STRIPS — goal already in initial_state → empty plan (trivial success)
// ---------------------------------------------------------------------------

/// Rank-2: STRIPS goal already satisfied returns empty plan (selected == Some("")).
/// This mirrors strips_presatisfied_goal_returns_empty_plan in breed_oracle_gaps.rs
/// but uses dispatch_breed_test for full end-to-end coverage.
#[test]
fn strips_goal_already_achieved() {
    let mut input = empty_base();
    input.state = vec![state_atom("done", "true")];
    input.goals = vec![goal("g1", "done", "true")];
    input.rules = vec![rule("make-done", vec!["precond=met"], "done=true", 1.0)];

    let output = dispatch_breed_test("strips", &input).expect("STRIPS presatisfied must not panic");

    // Domain contract: no steps needed → plan is empty string
    assert_eq!(
        output.selected.as_deref(),
        Some(""),
        "STRIPS goal already in initial state must yield empty plan (selected=Some(\"\"))"
    );
}

// ---------------------------------------------------------------------------
// 4. SOAR — empty operators (candidates) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: SOAR requires at least one operator candidate; empty set must be refused.
#[test]
fn soar_no_operators_refused() {
    use wasm4pm_cognition::breeds::soar::Soar;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.candidates = vec![]; // violates SOAR precondition

    let result = Soar.preconditions(&input);
    assert!(
        result.is_err(),
        "SOAR must refuse empty candidates vec; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("operator")
            || msg.to_lowercase().contains("soar")
            || msg.to_lowercase().contains("candidate"),
        "error must mention operator/soar/candidate, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 5. CBR — empty case_library → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: CBR requires at least one past case; empty library must be refused.
#[test]
fn cbr_empty_library_refused() {
    use wasm4pm_cognition::breeds::cbr::Cbr;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.cases = vec![]; // empty library
    input.facts = vec![fact("need", "offline")];

    let result = Cbr.preconditions(&input);
    assert!(
        result.is_err(),
        "CBR must refuse empty case library; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("case") || msg.to_lowercase().contains("cbr"),
        "error must mention case/CBR, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 6. GPS — goal equals current state → empty plan
// ---------------------------------------------------------------------------

/// Rank-2: GPS goal already in current state → no operators needed → empty plan.
#[test]
fn gps_goal_equals_state() {
    let mut input = empty_base();
    input.state = vec![state_atom("at", "B")];
    input.goals = vec![goal("g1", "at", "B")]; // already there
    input.rules = vec![rule("move-a-to-b", vec!["at=A"], "at=B", 1.0)];

    let output = dispatch_breed_test("gps", &input).expect("GPS presatisfied must not panic");

    assert_eq!(
        output.selected.as_deref(),
        Some(""),
        "GPS goal already in current state must yield empty plan (selected=Some(\"\"))"
    );
}

// ---------------------------------------------------------------------------
// 7. Hearsay — empty phonemes (facts) → trace has no seed steps
// ---------------------------------------------------------------------------

/// Rank-2: Hearsay with no facts produces no seed steps on the blackboard.
/// The breed still runs (rules are present), but seeds nothing.
#[test]
fn hearsay_empty_phonemes() {
    let mut input = empty_base();
    input.facts = vec![]; // no phonemes to seed
    input.rules = vec![rule("ks-phone-to-word", vec!["phone:T"], "word:THE", 0.9)];

    let output = dispatch_breed_test("hearsay", &input).expect("Hearsay must not panic");

    // With no seed facts there should be no "seed" trace steps.
    let seed_count = output
        .inference_trace
        .iter()
        .filter(|t| t.kind == "seed")
        .count();
    assert_eq!(
        seed_count, 0,
        "empty phoneme list must produce zero seed trace steps, got {seed_count}"
    );
}

// ---------------------------------------------------------------------------
// 8. DENDRAL — empty candidates → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: DENDRAL requires at least one candidate; empty set must be refused.
#[test]
fn dendral_empty_candidates() {
    use wasm4pm_cognition::breeds::dendral::Dendral;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.candidates = vec![]; // violates DENDRAL precondition

    let result = Dendral.preconditions(&input);
    assert!(
        result.is_err(),
        "DENDRAL must refuse empty candidates vec; got Ok"
    );
}

// ---------------------------------------------------------------------------
// 9. ELIZA — empty string input → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: ELIZA requires non-empty intent; empty string must be refused.
#[test]
fn eliza_empty_input() {
    use wasm4pm_cognition::breeds::frame::Eliza;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "".into(); // empty input violates ELIZA precondition

    let result = Eliza.preconditions(&input);
    assert!(result.is_err(), "ELIZA must refuse empty intent; got Ok");
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("intent") || msg.to_lowercase().contains("eliza"),
        "error must mention intent/eliza, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 10. AutoinstinctNeurosis — empty beliefs (facts) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctNeurosis requires at least one fact to seed the belief
/// network; empty facts must be refused.
#[test]
fn autoinstinct_neurosis_empty_beliefs() {
    use wasm4pm_cognition::breeds::autoinstinct_neurosis::AutoinstinctNeurosis;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![]; // no beliefs → violates precondition

    let result = AutoinstinctNeurosis.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctNeurosis must refuse empty beliefs; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("fact") || msg.to_lowercase().contains("belief"),
        "error must mention fact/belief, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 11. AutoinstinctVision — empty objects (facts) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctVision requires at least one fact as perceptual input;
/// empty facts must be refused.
#[test]
fn autoinstinct_vision_empty_objects() {
    use wasm4pm_cognition::breeds::autoinstinct_vision::AutoinstinctVision;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![]; // no objects → violates precondition

    let result = AutoinstinctVision.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctVision must refuse empty objects; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("fact")
            || msg.to_lowercase().contains("vision")
            || msg.to_lowercase().contains("object"),
        "error must mention fact/vision/object, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 12. AutoinstinctSemantics — empty sentence (intent) → precondition refuses
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctSemantics requires a non-empty intent sentence; empty
/// intent must be refused.
#[test]
fn autoinstinct_semantics_empty_sentence() {
    use wasm4pm_cognition::breeds::autoinstinct_semantics::AutoinstinctSemantics;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.intent = "   ".into(); // whitespace-only also violates precondition

    let result = AutoinstinctSemantics.preconditions(&input);
    assert!(
        result.is_err(),
        "AutoinstinctSemantics must refuse empty/whitespace intent; got Ok"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.to_lowercase().contains("intent") || msg.to_lowercase().contains("sentence"),
        "error must mention intent/sentence, got: {msg}"
    );
}

// ---------------------------------------------------------------------------
// 13. AutoinstinctLearning — all goals already achieved → trivial / empty plan
// ---------------------------------------------------------------------------

/// Rank-2: AutoinstinctLearning with all goals already satisfied (initial
/// bitmask == goal bitmask) must either refuse or return a trivial plan.
/// We verify via the preconditions gate (empty goals is refused) and separately
/// that a single pre-satisfied goal produces a zero-step plan or Err.
#[test]
fn autoinstinct_learning_all_goals_achieved() {
    use wasm4pm_cognition::breeds::autoinstinct_learning::AutoinstinctLearning;
    use wasm4pm_cognition::breeds::CognitionBreed;

    // Variant A: no goals at all → precondition refuses immediately.
    let mut input_no_goals = empty_base();
    input_no_goals.goals = vec![];
    let result_a = AutoinstinctLearning.preconditions(&input_no_goals);
    assert!(
        result_a.is_err(),
        "AutoinstinctLearning must refuse empty goals; got Ok"
    );

    // Variant B: goals provided but all already achieved via matching facts →
    // planner should find a 0-step plan or return Err (no work to do).
    // The breed encodes goals as bitmask; facts with matching goal values set
    // corresponding bits already — so plan has distance 0.
    let mut input_presatisfied = empty_base();
    input_presatisfied.goals = vec![goal("g0", "achieve", "sub-goal-0")];
    // Seed the fact that marks goal 0 as already achieved.
    input_presatisfied.facts = vec![fact("achieve", "sub-goal-0")];

    // Either Err or a plan with empty selected / 0 inference steps is acceptable.
    match dispatch_breed_test("autoinstinct_learning", &input_presatisfied) {
        Err(_) => {
            // Refused — acceptable refusal when no planning steps are needed.
        }
        Ok(output) => {
            // Succeeded but plan must be trivial: no inference steps beyond
            // the initial encode step, or selected describes 0 steps.
            let steps_to_goal = output
                .selected
                .as_deref()
                .unwrap_or("")
                .contains("0 steps to goal");
            let single_trace = output.inference_trace.len() <= 1;
            assert!(
                steps_to_goal || single_trace,
                "all-goals-achieved plan must be trivial (0 steps or single trace entry), \
                 got selected={:?}, trace_len={}",
                output.selected,
                output.inference_trace.len()
            );
        }
    }
}

// ===========================================================================
// P1 TIER — refusal tests (one per breed)
// ===========================================================================

/// ltl_monitor: missing ltl:formula fact must be refused.
#[test]
fn ltl_monitor_missing_formula_refused() {
    use wasm4pm_cognition::breeds::ltl_monitor::LtlMonitor;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.facts = vec![fact("trace:0", "zorp")];
    let err = LtlMonitor.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("ltl:formula"));
}

/// ltl_monitor: oversized formula (>256 chars) must be refused.
#[test]
fn ltl_monitor_oversized_formula_refused() {
    use wasm4pm_cognition::breeds::ltl_monitor::LtlMonitor;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.facts = vec![
        fact(
            "ltl:formula",
            &"a & ".repeat(65).trim_end_matches(" & ").to_string(),
        ),
        fact("trace:0", "a"),
    ];
    // 65 * 4 - 3 = 257 chars
    let err = LtlMonitor.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("256"));
}

/// allen_temporal: empty facts/state must be refused (AT-3 audit fix).
#[test]
fn allen_temporal_empty_facts_refused() {
    use wasm4pm_cognition::breeds::allen_temporal::AllenTemporal;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let input = empty_base();
    let err = AllenTemporal
        .preconditions(&input)
        .expect_err("must refuse");
    assert!(err.contains("relation") || err.contains("interval"));
}

/// fuzzy_logic: missing fuzzy:input facts must be refused.
#[test]
fn fuzzy_logic_missing_input_refused() {
    use wasm4pm_cognition::breeds::fuzzy_logic::FuzzyLogic;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.facts = vec![fact("fuzzy:zlorp:mid", "tri:2,5,8")];
    input.rules = vec![rule("r1", vec!["fuzzy:zlorp:mid"], "fuzzy:gwib:out", 1.0)];
    let err = FuzzyLogic.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("fuzzy:input"));
}

/// bayesian_network: missing query goal must be refused.
#[test]
fn bayesian_network_missing_query_refused() {
    use wasm4pm_cognition::breeds::bayesian_network::BayesianNetwork;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.facts = vec![fact("cpt:Q", "0.3")];
    let err = BayesianNetwork
        .preconditions(&input)
        .expect_err("must refuse");
    assert!(err.contains("query"));
}

/// csp_ac3: more than 24 variables must be refused.
#[test]
fn csp_ac3_too_many_vars_refused() {
    use wasm4pm_cognition::breeds::csp_ac3::CspAc3;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    for i in 0..25 {
        input.facts.push(fact("csp-var", &format!("V{}:a,b", i)));
    }
    let err = CspAc3.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("25 > 24"));
}

/// default_logic: empty rules must be refused.
#[test]
fn default_logic_empty_rules_refused() {
    use wasm4pm_cognition::breeds::default_logic::DefaultLogic;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.facts = vec![fact("obs", "wibble")];
    let err = DefaultLogic.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("rule"));
}

/// htn_planning: rules without method:/op: ids must be refused.
#[test]
fn htn_planning_malformed_rules_refused() {
    use wasm4pm_cognition::breeds::htn_planning::HtnPlanning;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.goals = vec![goal("g1", "task", "journey")];
    input.rules = vec![rule("plain-rule", vec![], "x=y", 1.0)];
    let err = HtnPlanning.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("method:"));
}

/// dempster_shafer: empty rules (no BPAs) must be refused.
#[test]
fn dempster_shafer_empty_rules_refused() {
    use wasm4pm_cognition::breeds::dempster_shafer::DempsterShafer;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.goals = vec![goal("query", "query", "flim")];
    let err = DempsterShafer
        .preconditions(&input)
        .expect_err("must refuse");
    assert!(err.contains("probability assignments"));
}

/// frames_inheritance: malformed intent must be refused.
#[test]
fn frames_inheritance_malformed_intent_refused() {
    use wasm4pm_cognition::breeds::frames_inheritance::FramesInheritance;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.intent = "what color is zilk".into();
    input.facts = vec![fact("frame:zilk:isa", "welp")];
    let err = FramesInheritance
        .preconditions(&input)
        .expect_err("must refuse");
    assert!(err.contains("resolve"));
}

/// ebl: missing domain theory must be refused.
#[test]
fn ebl_missing_domain_theory_refused() {
    use wasm4pm_cognition::breeds::ebl::Ebl;
    use wasm4pm_cognition::breeds::CognitionBreed;
    let mut input = empty_base();
    input.goals = vec![goal("g1", "drinkable(obj1)", "true")];
    let err = Ebl.preconditions(&input).expect_err("must refuse");
    assert!(err.contains("domain theory"));
}

// ===========================================================================
// P2 tier — refusal tests (12 breeds). Refusals are preconditions, so these
// route through breeds::dispatch::dispatch_breed (full lifecycle).
// ===========================================================================

use wasm4pm_cognition::breeds::dispatch::dispatch_breed as p2_dispatch;

/// ASP refuses an atom universe larger than its 12-atom enumeration cap.
#[test]
fn asp_refuses_oversized_atom_universe() {
    let mut input = empty_base();
    input.rules = (0..13)
        .map(|i| rule(&format!("f{}", i), vec![], &format!("atom{}", i), 1.0))
        .collect();
    let err = p2_dispatch("asp", &input).unwrap_err();
    assert!(err.contains("cap"), "got: {}", err);
}

/// Description logic refuses when no dl:subsumes query goal is supplied.
#[test]
fn description_logic_refuses_without_query() {
    let mut input = empty_base();
    input.facts = vec![fact("dl:subclass:A", "B")];
    let err = p2_dispatch("description_logic", &input).unwrap_err();
    assert!(err.contains("query"), "got: {}", err);
}

/// Abductive LP refuses when no abducibles are declared.
#[test]
fn abductive_lp_refuses_without_abducibles() {
    let mut input = empty_base();
    input.rules = vec![rule("r1", vec!["a"], "obs", 1.0)];
    input.goals = vec![goal("o1", "alp:observe", "obs")];
    let err = p2_dispatch("abductive_lp", &input).unwrap_err();
    assert!(err.contains("abducible"), "got: {}", err);
}

/// IBE refuses when there are no observations to explain.
#[test]
fn abductive_ibe_refuses_without_observations() {
    let mut input = empty_base();
    input.facts = vec![fact("ibe:hyp:h1:covers", "o1")];
    let err = p2_dispatch("abductive_ibe", &input).unwrap_err();
    assert!(err.contains("ibe:obs"), "got: {}", err);
}

/// SNLP refuses when no operators are declared.
#[test]
fn partial_order_plan_refuses_without_operators() {
    let mut input = empty_base();
    input.goals = vec![goal("g1", "on_a_b", "true")];
    input.state = vec![state_atom("clear_a", "true")];
    let err = p2_dispatch("partial_order_plan", &input).unwrap_err();
    assert!(err.contains("pop:op"), "got: {}", err);
}

/// Event calculus refuses a malformed HoldsAt query.
#[test]
fn event_calculus_refuses_malformed_query() {
    let mut input = empty_base();
    input.facts = vec![fact("ec:initially", "on")];
    input.goals = vec![goal("q1", "ec:holdsat", "on-at-four")];
    let err = p2_dispatch("event_calculus", &input).unwrap_err();
    assert!(err.contains("malformed"), "got: {}", err);
}

/// MDP refuses transition probabilities that do not sum to 1.
#[test]
fn mdp_refuses_non_normalized_probabilities() {
    let mut input = empty_base();
    input.facts = vec![fact("mdp:gamma", "0.5"), fact("mdp:trans:s1:a", "s1:0.4")];
    let err = p2_dispatch("mdp", &input).unwrap_err();
    assert!(err.contains("sum"), "got: {}", err);
}

/// Version space refuses when there is no positive example.
#[test]
fn version_space_refuses_without_positive_example() {
    let mut input = empty_base();
    input.facts = vec![fact("vs:attrs", "a,b"), fact("vs:example:1", "x,y:-")];
    let err = p2_dispatch("version_space", &input).unwrap_err();
    assert!(err.contains("positive"), "got: {}", err);
}

/// Belief merging refuses a single-base profile (nothing to merge).
#[test]
fn belief_merging_refuses_single_base() {
    let mut input = empty_base();
    input.facts = vec![fact("bm:atoms", "a"), fact("bm:base:1", "a")];
    let err = p2_dispatch("belief_merging", &input).unwrap_err();
    assert!(err.contains("two"), "got: {}", err);
}

/// Qualitative reasoning refuses a sign declaration for an unconstrained variable.
#[test]
fn qualitative_reason_refuses_unknown_sign_variable() {
    let mut input = empty_base();
    input.facts = vec![fact("qr:confluence:c1", "+x,-y"), fact("qr:sign:zz", "+")];
    let err = p2_dispatch("qualitative_reason", &input).unwrap_err();
    assert!(err.contains("zz"), "got: {}", err);
}

/// SAM refuses a story with no event in any known script vocabulary.
#[test]
fn script_sam_refuses_unknown_vocabulary() {
    let mut input = empty_base();
    input.facts = vec![fact("sam:event:1", "teleport:zz")];
    let err = p2_dispatch("script_sam", &input).unwrap_err();
    assert!(err.contains("vocabulary"), "got: {}", err);
}

/// CLP refuses a store with variables but no constraints.
#[test]
fn clp_refuses_without_constraints() {
    let mut input = empty_base();
    input.facts = vec![fact("clp:var:x", "1..3")];
    let err = p2_dispatch("clp", &input).unwrap_err();
    assert!(err.contains("constraint"), "got: {}", err);
}

// ===========================================================================
// P3 tier refusal tests — complexity caps and contract violations are
// refusals (Err), never silent truncation.
// ===========================================================================

fn p3_fact(key: &str, value: &str) -> Fact {
    Fact {
        key: key.into(),
        value: value.into(),
    }
}

/// situation_calculus refuses an empty action sequence (no do:<n> facts).
#[test]
fn situation_calculus_refuses_empty_action_sequence() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("fluent:on_a_b", "true")];
    let result = dispatch_breed_test("situation_calculus", &input);
    assert!(result.is_err(), "must refuse without do: steps");
}

/// circumscription refuses more than 12 abnormality atoms (cap is a refusal).
#[test]
fn circumscription_refuses_thirteen_ab_atoms() {
    let mut input = empty_base();
    input.rules = (0..13)
        .map(|i| Rule {
            id: format!("r{}", i),
            premise: vec![format!("base_{}", i)],
            conclusion: format!("ab_atom_{}", i),
            certainty: 1.0,
        })
        .collect();
    input.goals = vec![goal("g1", "entail", "anything")];
    let result = dispatch_breed_test("circumscription", &input);
    assert!(result.is_err(), "must refuse 13 ab-atoms");
    assert!(
        result.unwrap_err().contains("cap"),
        "error must name the complexity cap"
    );
}

/// analogy_sme refuses when there is no target domain.
#[test]
fn analogy_sme_refuses_missing_target() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("base:0", "(rel a b)")];
    let result = dispatch_breed_test("analogy_sme", &input);
    assert!(result.is_err(), "must refuse without target expressions");
}

/// act_r refuses an empty production set.
#[test]
fn act_r_refuses_no_productions() {
    let input = empty_base();
    let result = dispatch_breed_test("act_r", &input);
    assert!(result.is_err(), "must refuse without production rules");
}

/// problog refuses more than 12 probabilistic facts (2^k blow-up guard).
#[test]
fn problog_refuses_thirteen_pfacts() {
    let mut input = empty_base();
    input.facts = (0..13)
        .map(|i| p3_fact(&format!("pfact:atom_{}", i), "0.5"))
        .collect();
    input.goals = vec![goal("g1", "query", "atom_0")];
    let result = dispatch_breed_test("problog", &input);
    assert!(result.is_err(), "must refuse 13 pfacts");
    assert!(
        result.unwrap_err().contains("cap"),
        "error must name the complexity cap"
    );
}

/// problog refuses an out-of-range probability.
#[test]
fn problog_refuses_probability_above_one() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("pfact:rain", "1.5")];
    input.goals = vec![goal("g1", "query", "rain")];
    let result = dispatch_breed_test("problog", &input);
    assert!(result.is_err(), "must refuse p > 1");
}

/// sat_cdcl refuses an empty formula.
#[test]
fn sat_cdcl_refuses_no_clauses() {
    let input = empty_base();
    let result = dispatch_breed_test("sat_cdcl", &input);
    assert!(result.is_err(), "must refuse without clauses");
}

/// episodic_memory refuses an episode that has no time fact.
#[test]
fn episodic_memory_refuses_missing_time() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("cue:t", "5")];
    input.cases = vec![Case {
        id: "ep-untimed".into(),
        intent: "x".into(),
        architecture: "episode".into(),
        outcome_score: 0.5,
        facts: vec![p3_fact("k", "v")],
    }];
    let result = dispatch_breed_test("episodic_memory", &input);
    assert!(
        result.is_err(),
        "must refuse an episode without episode:<id>:t"
    );
}

/// rl_symbolic refuses gamma >= 1 (divergent discounting).
#[test]
fn rl_symbolic_refuses_gamma_one() {
    let mut input = empty_base();
    input.facts = vec![
        p3_fact("mdp:gamma", "1.0"),
        p3_fact("mdp:start", "s0"),
        p3_fact("mdp:t:s0:go", "s0"),
    ];
    let result = dispatch_breed_test("rl_symbolic", &input);
    assert!(result.is_err(), "must refuse gamma = 1.0");
}

/// ctl_check refuses a non-total transition relation (CTL requires totality).
#[test]
fn ctl_check_refuses_non_total_relation() {
    let mut input = empty_base();
    input.facts = vec![
        p3_fact("ts:init", "a"),
        p3_fact("ts:edge:a", "b"), // b has no successor
        p3_fact("ctl:formula", "A G p"),
    ];
    let result = dispatch_breed_test("ctl_check", &input);
    assert!(result.is_err(), "must refuse a deadlock state");
    assert!(result.unwrap_err().contains("total"));
}

/// ilp refuses when there is no background knowledge.
#[test]
fn ilp_refuses_no_background() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("pos:daughter(mary,ann)", "true")];
    let result = dispatch_breed_test("ilp", &input);
    assert!(result.is_err(), "must refuse without bg: facts");
}

/// naive_physics refuses a cyclic support chain (physically impossible scene).
#[test]
fn naive_physics_refuses_cyclic_support() {
    let mut input = empty_base();
    input.facts = vec![p3_fact("np:on:a", "b"), p3_fact("np:on:b", "a")];
    let result = dispatch_breed_test("naive_physics", &input);
    assert!(result.is_err(), "must refuse a support cycle");
    assert!(result.unwrap_err().contains("cyclic"));
}

// ===========================================================================
// P4 tier refusal tests (tableaux, construction_grammar, markov_logic,
// pomdp, contingent_plan, meta_reasoning)
// ===========================================================================

/// Rank-2: tableaux requires a parseable propositional 'tableaux:formula' fact.
#[test]
fn tableaux_missing_or_temporal_formula_refused() {
    use wasm4pm_cognition::breeds::tableaux::Tableaux;
    use wasm4pm_cognition::breeds::CognitionBreed;

    // No formula fact at all.
    let input = empty_base();
    assert!(Tableaux.preconditions(&input).is_err());

    // Temporal operator: outside the propositional fragment.
    let mut input = empty_base();
    input.facts = vec![fact("tableaux:formula", "G zorp")];
    assert!(Tableaux.preconditions(&input).is_err());

    // Malformed formula.
    let mut input = empty_base();
    input.facts = vec![fact("tableaux:formula", "(a -> ")];
    assert!(Tableaux.preconditions(&input).is_err());
}

/// Rank-2: construction_grammar refuses an empty utterance / empty lexicon,
/// and refuses (Err at run) words missing from the lexicon — no POS guessing.
#[test]
fn construction_grammar_empty_or_unknown_refused() {
    use wasm4pm_cognition::breeds::construction_grammar::ConstructionGrammar;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let input = empty_base();
    assert!(ConstructionGrammar.preconditions(&input).is_err());

    let mut input = empty_base();
    input.facts = vec![
        fact("cxg:utterance", "the gronkulator hums"),
        fact("lex:the:pos", "det"),
        fact("lex:hums:pos", "verb"),
    ];
    // 'gronkulator' is not in the lexicon: run must refuse.
    assert!(ConstructionGrammar.run(&input).is_err());
}

/// Rank-2: markov_logic refuses empty clause sets and negative weights.
#[test]
fn markov_logic_negative_weight_refused() {
    use wasm4pm_cognition::breeds::markov_logic::MarkovLogic;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let input = empty_base();
    assert!(MarkovLogic.preconditions(&input).is_err());

    let mut input = empty_base();
    input.facts = vec![fact("mln:clause:bad", "-2.0|zibble")];
    assert!(MarkovLogic.preconditions(&input).is_err());
}

/// Rank-2: pomdp refuses non-stochastic rows and oversized |S|·|A|·|O|.
#[test]
fn pomdp_nonstochastic_model_refused() {
    use wasm4pm_cognition::breeds::pomdp::Pomdp;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![
        fact("pomdp:states", "s1,s2"),
        fact("pomdp:actions", "a"),
        fact("pomdp:observations", "o1,o2"),
        fact("pomdp:b0:s1", "0.5"),
        fact("pomdp:b0:s2", "0.5"),
        // T(a, s1, ·) sums to 0.7 — must be refused.
        fact("pomdp:t:a:s1:s1", "0.7"),
        fact("pomdp:t:a:s1:s2", "0.0"),
        fact("pomdp:t:a:s2:s1", "0.0"),
        fact("pomdp:t:a:s2:s2", "1.0"),
        fact("pomdp:o:a:s1:o1", "0.5"),
        fact("pomdp:o:a:s1:o2", "0.5"),
        fact("pomdp:o:a:s2:o1", "0.5"),
        fact("pomdp:o:a:s2:o2", "0.5"),
    ];
    assert!(Pomdp.preconditions(&input).is_err());
}

/// Rank-2: contingent_plan REFUSES when the belief is uncertain and no
/// sensing action exists — it must never emit a linear plan that only
/// works in some worlds.
#[test]
fn contingent_plan_uncertain_without_sensing_refused() {
    use wasm4pm_cognition::breeds::contingent_plan::ContingentPlan;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![
        fact("cp:unknown", "dirt"),
        fact("cp:goal:dirt", "false"),
        fact("cp:act:suck:pre", "dirt"),
        fact("cp:act:suck:del", "dirt"),
        // NO cp:sense:* facts — sensing is unavailable.
    ];
    assert!(ContingentPlan.run(&input).is_err());
}

/// Rank-2: meta_reasoning requires at least two complete breed reports.
#[test]
fn meta_reasoning_single_report_refused() {
    use wasm4pm_cognition::breeds::meta_reasoning::MetaReasoning;
    use wasm4pm_cognition::breeds::CognitionBreed;

    let mut input = empty_base();
    input.facts = vec![
        fact("breed:mycin:conclusion", "therapy=gentamicin"),
        fact("breed:mycin:confidence", "0.8"),
    ];
    assert!(MetaReasoning.preconditions(&input).is_err());

    // Conclusion without confidence is also incomplete.
    let mut input = empty_base();
    input.facts = vec![
        fact("breed:mycin:conclusion", "therapy=gentamicin"),
        fact("breed:prolog:conclusion", "therapy=none"),
        fact("breed:prolog:confidence", "0.6"),
    ];
    assert!(MetaReasoning.preconditions(&input).is_err());
}
